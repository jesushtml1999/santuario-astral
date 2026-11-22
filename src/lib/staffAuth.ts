import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";
import {
  readLocalMasters,
  withDirectoryLock,
  writeLocalMasters,
} from "@/lib/localMasters";
import type { StaffSession, StaffRole } from "@/types/staff";

export const STAFF_CHANGED = "santuario-astral:staff-changed";
export const STAFF_ACCOUNTS_KEY = "santuario-astral:staff-accounts:v1";
const STAFF_SESSION_KEY = "santuario-astral:staff-session:v1";
export const DEMO_ADMIN_LOGIN = "admin@demo.santuario.test";
export const DEMO_ADMIN_PASSWORD = "SantuarioDemo2026!";
export const DEMO_MASTER_PASSWORD = "AstralDemo2026!";
export interface LocalStaffAccount {
  phone?: string;
  uid: string;
  role: StaffRole;
  masterId?: string;
  email: string;
  displayName: string;
  salt: string;
  passwordHash: string;
  version: number;
  disabled: boolean;
}

export function readLocalStaffAccounts(): LocalStaffAccount[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STAFF_ACCOUNTS_KEY);
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !Array.isArray(value) ||
      value.some(
        (item: unknown) =>
          typeof item !== "object" ||
          item === null ||
          !("uid" in item) ||
          typeof item.uid !== "string" ||
          !("role" in item) ||
          (item.role !== "maestro" && item.role !== "admin") ||
          !("passwordHash" in item) ||
          typeof item.passwordHash !== "string" ||
          !("salt" in item) ||
          typeof item.salt !== "string" ||
          !("email" in item) ||
          typeof item.email !== "string" ||
          !("version" in item) ||
          typeof item.version !== "number" ||
          (item.role === "maestro" &&
            (!("masterId" in item) || typeof item.masterId !== "string")),
      )
    )
      throw new Error("Invalid accounts");
    return value as LocalStaffAccount[];
  } catch {
    throw new Error(
      "Los accesos locales no se pueden leer. No se han sobrescrito.",
    );
  }
}
export function writeLocalStaffAccounts(accounts: LocalStaffAccount[]) {
  window.localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(accounts));
  window.dispatchEvent(new Event(STAFF_CHANGED));
}
export async function hashLocalPassword(
  password: string,
  salt: string,
): Promise<string> {
  const bytes = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    "raw",
    bytes.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const result = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: bytes.encode(salt),
      iterations: 120000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(result), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
export async function initializeDemoStaff(): Promise<void> {
  if (isFirebaseConfigured()) return;
  await withDirectoryLock(async () => {
    if (window.localStorage.getItem(STAFF_ACCOUNTS_KEY) !== null) {
      readLocalStaffAccounts();
      return;
    }
    const masters = readLocalMasters();
    const definitions: Array<
      Pick<
        LocalStaffAccount,
        "uid" | "masterId" | "role" | "email" | "displayName"
      >
    > = [
      {
        uid: "local-admin",
        role: "admin",
        email: DEMO_ADMIN_LOGIN,
        displayName: "Administración demo",
      },
      ...masters.map((master) => ({
        uid: "staff-" + master.id,
        masterId: master.id,
        role: "maestro" as const,
        email: `${master.id.replace(/^demo-/, "")}@demo.santuario.test`,
        displayName: master.name,
      })),
    ];
    const accounts = await Promise.all(
      definitions.map(async (definition) => {
        const salt = window.crypto.randomUUID();
        return {
          ...definition,
          salt,
          passwordHash: await hashLocalPassword(
            definition.role === "admin"
              ? DEMO_ADMIN_PASSWORD
              : DEMO_MASTER_PASSWORD,
            salt,
          ),
          version: 1,
          disabled: false,
        };
      }),
    );
    writeLocalMasters(masters);
    writeLocalStaffAccounts(accounts);
  });
}

/** Demo authorization is intentionally browser-local, never accepted by cloud APIs. */
export function getLocalStaffSession(): StaffSession | null {
  if (isFirebaseConfigured() || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      !("uid" in value) ||
      !("version" in value)
    )
      return null;
    const account = readLocalStaffAccounts().find(
      (item) =>
        item.uid === value.uid &&
        item.version === value.version &&
        !item.disabled,
    );
    if (!account) return null;
    const master = account.masterId
      ? readLocalMasters().find((item) => item.id === account.masterId)
      : null;
    if (account.role === "maestro" && !master) return null;
    return {
      uid: account.uid,
      role: account.role,
      masterId: account.masterId,
      displayName: master?.name ?? account.displayName,
      email: account.email,
      mode: "local",
    };
  } catch {
    return null;
  }
}
export async function getStaffSession(): Promise<StaffSession | null> {
  if (!isFirebaseConfigured()) return getLocalStaffSession();
  const { staffAuth, staffDb } = await import("@/lib/staffFirebase");
  await staffAuth.authStateReady();
  const user = staffAuth.currentUser;
  if (!user) return null;
  const { doc, getDoc } = await import("firebase/firestore");
  const profile = await getDoc(doc(staffDb, "users", user.uid));
  const value: unknown = profile.data();
  if (
    typeof value !== "object" ||
    value === null ||
    !("role" in value) ||
    (value.role !== "maestro" && value.role !== "admin") ||
    ("disabled" in value && value.disabled === true)
  )
    return null;
  if (
    value.role === "maestro" &&
    (!("masterId" in value) ||
      typeof value.masterId !== "string" ||
      value.masterId !== user.uid)
  )
    return null;
  return {
    uid: user.uid,
    role: value.role,
    masterId:
      "masterId" in value && typeof value.masterId === "string"
        ? value.masterId
        : undefined,
    displayName:
      "displayName" in value && typeof value.displayName === "string"
        ? value.displayName
        : (user.displayName ?? "Mi espacio"),
    email: user.email ?? "",
    mode: "firebase",
  };
}
export async function requireStaff(role?: StaffRole): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session || (role && session.role !== role))
    throw new Error("Tu sesión no tiene permiso para realizar esta acción.");
  return session;
}
export async function signInStaff(
  login: string,
  password: string,
): Promise<StaffSession> {
  if (!isFirebaseConfigured()) {
    await initializeDemoStaff();
    const account = readLocalStaffAccounts().find(
      (item) => item.email === login.trim().toLowerCase() && !item.disabled,
    );
    if (
      !account ||
      (await hashLocalPassword(password, account.salt)) !== account.passwordHash
    )
      throw new Error("El acceso o la contraseña no son correctos.");
    window.sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ uid: account.uid, version: account.version }),
    );
    window.dispatchEvent(new Event(STAFF_CHANGED));
  } else {
    const { staffAuth } = await import("@/lib/staffFirebase");
    const {
      setPersistence,
      browserSessionPersistence,
      signInWithEmailAndPassword,
      signOut,
    } = await import("firebase/auth");
    await setPersistence(staffAuth, browserSessionPersistence);
    await signInWithEmailAndPassword(staffAuth, login.trim(), password);
    if (!(await getStaffSession())) {
      await signOut(staffAuth);
      throw new Error(
        "Esta cuenta no tiene un rol de maestro o administrador habilitado.",
      );
    }
    window.dispatchEvent(new Event(STAFF_CHANGED));
  }
  return requireStaff();
}
export async function signOutStaff(): Promise<void> {
  if (!isFirebaseConfigured())
    window.sessionStorage.removeItem(STAFF_SESSION_KEY);
  else {
    const { staffAuth } = await import("@/lib/staffFirebase");
    const { signOut } = await import("firebase/auth");
    await signOut(staffAuth);
  }
  window.dispatchEvent(new Event(STAFF_CHANGED));
}
export function subscribeStaffSession(
  next: (session: StaffSession | null) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true,
    request = 0;
  const cleanups: Array<() => void> = [];
  const refresh = () => {
    const current = ++request;
    void getStaffSession().then(
      (session) => {
        if (active && current === request) next(session);
      },
      (error) => {
        if (active && current === request) onError(error);
      },
    );
  };
  window.addEventListener(STAFF_CHANGED, refresh);
  window.addEventListener("storage", refresh);
  cleanups.push(() => {
    window.removeEventListener(STAFF_CHANGED, refresh);
    window.removeEventListener("storage", refresh);
  });
  if (isFirebaseConfigured())
    void import("@/lib/staffFirebase")
      .then(async ({ staffAuth, staffDb }) => {
        const { onAuthStateChanged } = await import("firebase/auth");
        const { doc, onSnapshot } = await import("firebase/firestore");
        if (!active) return;
        let stopRole: (() => void) | undefined;
        cleanups.push(
          onAuthStateChanged(staffAuth, (user) => {
            stopRole?.();
            refresh();
            if (user)
              stopRole = onSnapshot(
                doc(staffDb, "users", user.uid),
                refresh,
                onError,
              );
          }),
        );
        cleanups.push(() => stopRole?.());
      })
      .catch(onError);
  refresh();
  return () => {
    active = false;
    cleanups.forEach((stop) => stop());
  };
}
export async function staffApi(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  await requireStaff("admin");
  const { staffAuth } = await import("@/lib/staffFirebase");
  const token = await staffAuth.currentUser?.getIdToken();
  if (!token) throw new Error("Vuelve a iniciar sesión.");
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "No pudimos completar la operación.",
    );
  return data;
}
