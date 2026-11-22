import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Timestamp } from "firebase/firestore";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function evaluate(file, globals) {
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module: compiledModule,
      exports: compiledModule.exports,
      Error,
      DOMException,
      URL,
      Blob,
      Event,
      CustomEvent,
      TextEncoder,
      TextDecoder,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      queueMicrotask,
      ...globals,
    },
    { filename: file },
  );
  return compiledModule.exports;
}

export function createHarness(configured = false) {
  const local = new Map(),
    cloud = new Map(),
    uploads = new Map(),
    listeners = new Set(),
    authListeners = new Set();
  const window = new EventTarget();
  const staffSession = new Map();
  window.sessionStorage = {
    getItem: (key) => staffSession.get(key) ?? null,
    setItem: (key, value) => staffSession.set(key, value),
    removeItem: (key) => staffSession.delete(key),
  };
  let quota = false;
  window.crypto = crypto.webcrypto;
  window.localStorage = {
    get length() {
      return local.size;
    },
    key: (index) => [...local.keys()][index] ?? null,
    getItem: (key) => local.get(key) ?? null,
    setItem: (key, value) => {
      if (quota) throw new Error("QuotaExceededError");
      local.set(key, value);
    },
  };
  const lockQueues = new Map();
  const navigator = {
    locks: {
      request: (key, action) => {
        const job = (lockQueues.get(key) ?? Promise.resolve()).then(action);
        lockQueues.set(
          key,
          job.catch(() => {}),
        );
        return job;
      },
    },
  };
  const auth = {
    currentUser: { uid: "client-auth", isAnonymous: true },
    authStateReady: async () => {},
  };
  const ref = (kind, ...args) => ({
    kind,
    path: (args[0]?.path
      ? [args[0].path, ...args.slice(1)]
      : args.slice(1)
    ).join("/"),
  });
  const document = (key) => ({
    id: key.split("/").at(-1),
    exists: () => cloud.has(key),
    data: () => cloud.get(key),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  function snapshot(reference) {
    return reference.kind === "doc"
      ? document(reference.path)
      : {
          metadata: { fromCache: false },
          docs: [...cloud.keys()]
            .filter(
              (key) =>
                key.startsWith(reference.path + "/") &&
                key.slice(reference.path.length + 1).indexOf("/") < 0,
            )
            .map(document),
        };
  }
  const notify = () => {
    for (const listener of [...listeners])
      queueMicrotask(() => {
        if (listeners.has(listener))
          listener.next(snapshot(listener.reference));
      });
  };
  let transactionQueue = Promise.resolve();
  const firestore = {
    Timestamp,
    doc: (...args) => ref("doc", ...args),
    collection: (...args) => ref("query", ...args),
    query: (reference) => reference,
    where: () => null,
    orderBy: () => null,
    limit: () => null,
    getDoc: async (reference) => document(reference.path),
    getDocFromServer: async (reference) => document(reference.path),
    getDocs: async (reference) => snapshot(reference),
    getDocsFromServer: async (reference) => snapshot(reference),
    serverTimestamp: () => Timestamp.now(),
    onSnapshot: (reference, ...args) => {
      const next = typeof args[0] === "function" ? args[0] : args[1];
      const listener = { reference, next };
      listeners.add(listener);
      queueMicrotask(() => {
        if (listeners.has(listener)) next(snapshot(reference));
      });
      return () => listeners.delete(listener);
    },
    runTransaction: (_db, action) => {
      const job = transactionQueue.then(async () => {
        const writes = [];
        await action({
          get: async (reference) => document(reference.path),
          set: (reference, value, options) =>
            writes.push([reference.path, value, options?.merge]),
          update: (reference, value) =>
            writes.push([reference.path, value, true]),
        });
        for (const [key, value, merge] of writes)
          cloud.set(key, merge ? { ...cloud.get(key), ...value } : value);
        notify();
      });
      transactionQueue = job.catch(() => {});
      return job;
    },
  };
  class Reader {
    readAsDataURL(blob) {
      void blob.arrayBuffer().then((bytes) => {
        if (this.aborted) return;
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
        this.onload?.();
      });
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
  }
  const env = configured
    ? Object.fromEntries(
        [
          "API_KEY",
          "AUTH_DOMAIN",
          "PROJECT_ID",
          "STORAGE_BUCKET",
          "MESSAGING_SENDER_ID",
          "APP_ID",
        ].map((key) => ["NEXT_PUBLIC_FIREBASE_" + key, "local-test"]),
      )
    : {};
  const cache = new Map();
  function requireModule(name) {
    if (name === "firebase/firestore") return firestore;
    if (name === "firebase/storage")
      throw new Error("Firebase Storage must remain uninitialized.");
    if (name === "firebase/auth")
      return {
        signInAnonymously: async () => ({
          user: (auth.currentUser = {
            uid: "anonymous-auth",
            isAnonymous: true,
          }),
        }),
        onAuthStateChanged: (_auth, callback) => {
          authListeners.add(callback);
          queueMicrotask(() => {
            if (authListeners.has(callback)) callback(auth.currentUser);
          });
          return () => authListeners.delete(callback);
        },
      };
    if (name === "@/lib/firebase") return { db: {}, auth };
    if (name === "@/lib/staffFirebase") return { staffDb: {}, staffAuth: auth };
    if (cache.has(name)) return cache.get(name);
    if (!name.startsWith("@/lib/"))
      throw new Error("Unexpected test import: " + name);
    const exported = evaluate("src/" + name.slice(2) + ".ts", {
      window,
      navigator,
      FileReader: Reader,
      process: { env },
      require: requireModule,
    });
    cache.set(name, exported);
    return exported;
  }
  const consultations = requireModule("@/lib/consultations");
  const service = requireModule("@/lib/chatService");
  const guest = requireModule("@/lib/guestSession").getOrCreateGuestId();
  const masters = requireModule("@/lib/mockMasters").mockMasters;
  const createRoom = async (index = 0) => {
    const master = configured
      ? { ...masters[index], id: "master-" + index }
      : masters[index];
    cloud.set("masters/" + master.id, master);
    return consultations.startConsultation(
      master,
      {
        guestId: guest,
        name: "Visitante de prueba",
        birthDateOrSign: "Libra",
        initialTopic: "Pregunta inicial de prueba",
      },
      { isDemo: !configured, requestId: crypto.randomUUID() },
    );
  };
  return {
    local,
    cloud,
    uploads,
    listeners,
    authListeners,
    auth,
    guest,
    masters,
    createRoom,
    consultations,
    service,
    staff: requireModule("@/lib/staffAuth"),
    staffService: requireModule("@/lib/staffService"),
    localMasters: requireModule("@/lib/localMasters"),
    publicMasters: requireModule("@/lib/masters"),
    window,
    notify,
    setQuota: (value) => {
      quota = value;
    },
    changeUser: (user) => {
      auth.currentUser = user;
      for (const callback of authListeners) callback(user);
    },
  };
}
export const flush = () => new Promise((resolve) => setImmediate(resolve));
