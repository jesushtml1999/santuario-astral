// Runs only through the local emulators, against a demo project without cloud credentials.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp,
  setLogLevel,
} from "firebase/firestore";
import { ref, uploadBytes, getMetadata, deleteObject } from "firebase/storage";

setLogLevel("silent");
let env;
const masterA = "master-a",
  masterB = "master-b";
const guest = "11111111-1111-4111-8111-111111111111";
const roomId = `${guest}_${masterA}`;
const profile = (id, isActive = true) => ({
  id,
  name: "Guía de prueba",
  specialty: "Tarot",
  specialties: ["Tarot"],
  bio: "Biografía ficticia",
  avatarUrl: "",
  experienceYears: 2,
  rating: 0,
  reviewsCount: 0,
  isOnline: false,
  isActive,
  isTestProfile: true,
});
const room = (id = roomId, clientAuthUid = "client-a", masterId = masterA) => ({
  id,
  guestId: guest,
  masterId,
  clientAuthUid,
  clientName: "Visitante de prueba",
  clientZodiac: "Libra",
  masterName: "Guía de prueba",
  masterAvatar: "",
  initialTopic: "Pregunta de prueba",
  lastMessage: "Pregunta de prueba",
  lastMessageAt: Timestamp.now(),
  lastMessageId: "initial-message",
  unreadByMaster: 1,
  unreadByClient: 0,
  statusTag: "Nuevo",
});
const client = (uid) =>
  env.authenticatedContext(uid, {
    firebase: { sign_in_provider: "anonymous" },
  });
const staff = (uid) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: "password" } });
const message = (id, senderId = guest, senderRole = "cliente") => ({
  id,
  senderId,
  senderRole,
  type: "text",
  text: "Mensaje de prueba",
  createdAt: serverTimestamp(),
});

test("presence leases stay server-controlled and private connection records cannot be read or forged", async () => {
  const own = staff(masterA).firestore();
  const pub = env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), "masters", masterA), { presenceExpiresAt: Timestamp.now() });
    await setDoc(doc(ctx.firestore(), "staffPresence", masterA), { available: true, connections: {} });
  });
  await assertSucceeds(updateDoc(doc(own, "masters", masterA), { bio: "Perfil actualizado con presencia automática." }));
  await assertFails(updateDoc(doc(own, "masters", masterA), { presenceExpiresAt: Timestamp.fromMillis(Date.now() + 999999) }));
  for (const db of [own, pub, staff("admin").firestore(), client("client-a").firestore()]) {
    await assertFails(getDoc(doc(db, "staffPresence", masterA)));
    await assertFails(setDoc(doc(db, "staffPresence", masterA), { connections: {} }));
  }
});

before(
  async () => {
    assert.match(
      process.env.FIRESTORE_EMULATOR_HOST ?? "",
      /^(127\.0\.0\.1|localhost):\d+$/,
    );
    assert.match(
      process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "",
      /^(127\.0\.0\.1|localhost):\d+$/,
    );
    env = await initializeTestEnvironment({
      projectId: "demo-santuario-astral",
      firestore: {
        rules: await readFile(
          new URL("../firestore.rules", import.meta.url),
          "utf8",
        ),
      },
      storage: {
        rules: await readFile(
          new URL("../storage.rules", import.meta.url),
          "utf8",
        ),
      },
    });
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await Promise.all([
        setDoc(doc(db, "users", masterA), {
          role: "maestro",
          masterId: masterA,
          disabled: false,
        }),
        setDoc(doc(db, "users", masterB), {
          role: "maestro",
          masterId: masterB,
          disabled: false,
        }),
        setDoc(doc(db, "users", "admin-a"), { role: "admin", disabled: false }),
        setDoc(doc(db, "users", "disabled-admin"), {
          role: "admin",
          disabled: true,
        }),
        setDoc(doc(db, "users", "forged-master"), {
          role: "maestro",
          masterId: masterA,
          disabled: false,
        }),
        setDoc(doc(db, "masters", masterA), profile(masterA)),
        setDoc(doc(db, "masters", masterB), profile(masterB, false)),
        setDoc(doc(db, "chats", roomId), room()),
      ]);
      await setDoc(doc(db, "chats", roomId, "messages", "initial-message"), {
        ...message("initial-message"),
        createdAt: Timestamp.now(),
      });
    });
  },
  { timeout: 120_000 },
);
after(async () => {
  await env?.cleanup();
});

test("country is public and validated; phone is private and cannot be placed in a public profile", async () => {
  const publicDb = env.unauthenticatedContext().firestore();
  const adminDb = staff("admin-a").firestore();
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "users", masterA), { phone: "+573001234567" });
  });
  await assertSucceeds(updateDoc(doc(adminDb, "masters", masterA), { countryCode: "CO" }));
  assert.equal((await getDoc(doc(publicDb, "masters", masterA))).data().countryCode, "CO");
  await assertFails(updateDoc(doc(adminDb, "masters", masterA), { countryCode: "ZZ" }));
  await assertFails(updateDoc(doc(adminDb, "masters", masterA), { phone: "+573001234567" }));
  await assertFails(getDoc(doc(publicDb, "users", masterA)));
  await assertFails(getDoc(doc(staff(masterB).firestore(), "users", masterA)));
  await assertSucceeds(getDoc(doc(staff(masterA).firestore(), "users", masterA)));
  await assertFails(updateDoc(doc(staff(masterA).firestore(), "users", masterA), { phone: "+573001234567" }));
  await assertSucceeds(updateDoc(doc(staff(masterA).firestore(), "masters", masterA), { countryCode: "MX" }));
});

test("catalog is public only for active profiles; only an enabled admin creates profiles or edits administrative fields", async () => {
  const publicDb = env.unauthenticatedContext().firestore(),
    adminDb = staff("admin-a").firestore();
  await assertSucceeds(
    getDocs(
      query(collection(publicDb, "masters"), where("isActive", "==", true)),
    ),
  );
  await assertFails(getDocs(collection(publicDb, "masters")));
  await assertFails(getDoc(doc(publicDb, "masters", masterB)));
  await assertFails(
    setDoc(doc(publicDb, "masters", "new-master"), profile("new-master")),
  );
  await assertFails(
    setDoc(
      doc(client("client-a").firestore(), "masters", "new-master"),
      profile("new-master"),
    ),
  );
  await assertSucceeds(
    setDoc(doc(adminDb, "masters", "new-master"), profile("new-master")),
  );
  await assertSucceeds(
    updateDoc(doc(adminDb, "masters", "new-master"), { isActive: false }),
  );
  await assertFails(
    setDoc(doc(adminDb, "masters", "bad-profile"), {
      ...profile("bad-profile"),
      rating: 99,
    }),
  );
  await assertFails(
    updateDoc(doc(staff("disabled-admin").firestore(), "masters", masterA), {
      isActive: false,
    }),
  );
  await assertFails(
    setDoc(doc(client("client-a").firestore(), "users", "client-a"), {
      role: "admin",
    }),
  );
  await assertFails(
    updateDoc(doc(adminDb, "users", masterA), { role: "admin" }),
  );
  // The trusted API performs account cleanup and checks for conversations before deletion.
  await assertFails(deleteDoc(doc(adminDb, "masters", masterA)));
});

test("a master edits only their own public fields, not visibility, credentials or metrics", async () => {
  const db = staff(masterA).firestore();
  await assertSucceeds(
    updateDoc(doc(db, "masters", masterA), { isOnline: true }),
  );
  await assertSucceeds(
    updateDoc(doc(db, "masters", masterA), {
      bio: "Nueva biografía de prueba",
      specialty: "Amor",
      specialties: ["Amor", "Tarot"],
      avatarUrl: "https://example.test/avatar.jpg",
    }),
  );
  for (const patch of [
    { isActive: false },
    { rating: 5 },
    { name: "Cambio no autorizado" },
    { bio: "" },
    { avatarUrl: "javascript:alert(1)" },
    { specialty: "Otra", specialties: ["Otra"] },
  ])
    await assertFails(updateDoc(doc(db, "masters", masterA), patch));
  await assertFails(updateDoc(doc(db, "masters", masterB), { isOnline: true }));
  await assertFails(
    updateDoc(doc(staff("forged-master").firestore(), "masters", masterA), {
      isOnline: false,
    }),
  );
});

test("anonymous clients and masters can query only their own conversations; admins have read-only supervision", async () => {
  const clientDb = client("client-a").firestore(),
    masterDb = staff(masterA).firestore(),
    adminDb = staff("admin-a").firestore();
  await assertSucceeds(
    getDocs(
      query(
        collection(clientDb, "chats"),
        where("clientAuthUid", "==", "client-a"),
      ),
    ),
  );
  await assertSucceeds(
    getDocs(
      query(collection(masterDb, "chats"), where("masterId", "==", masterA)),
    ),
  );
  await assertFails(getDocs(collection(masterDb, "chats")));
  await assertFails(
    getDocs(
      query(collection(masterDb, "chats"), where("masterId", "==", masterB)),
    ),
  );
  await assertFails(
    getDoc(doc(client("client-b").firestore(), "chats", roomId)),
  );
  await assertFails(
    getDocs(
      collection(client("client-b").firestore(), "chats", roomId, "messages"),
    ),
  );
  await assertFails(getDoc(doc(staff(masterB).firestore(), "chats", roomId)));
  await assertFails(
    getDoc(doc(staff("forged-master").firestore(), "chats", roomId)),
  );
  await assertFails(
    getDoc(doc(env.unauthenticatedContext().firestore(), "chats", roomId)),
  );
  await assertSucceeds(getDocs(collection(adminDb, "chats")));
  await assertSucceeds(
    getDocs(
      query(
        collection(adminDb, "chats", roomId, "messages"),
        orderBy("createdAt"),
      ),
    ),
  );
  await assertFails(
    updateDoc(doc(adminDb, "chats", roomId), { statusTag: "Pagado" }),
  );
});

async function createConsultation(db, id, overrides = {}) {
  const batch = writeBatch(db),
    initial = "intake-" + randomUUID();
  const createdRoom = {
    ...room(id),
    ...overrides,
    lastMessageId: initial,
    lastMessageAt: serverTimestamp(),
  };
  batch.set(doc(db, "chats", id), createdRoom);
  batch.set(doc(db, "chats", id, "messages", initial), {
    ...message(initial, createdRoom.guestId),
    text: "Pregunta de prueba",
  });
  return batch.commit();
}
test("anonymous intake atomically creates a valid room/message and rejects ownership spoofing, malformed IDs and missing messages", async () => {
  const db = client("client-a").firestore();
  const nextGuest = randomUUID(),
    validId = `${nextGuest}_${masterA}`;
  await assertSucceeds(createConsultation(db, validId, { guestId: nextGuest }));
  await assertFails(
    createConsultation(
      client("client-b").firestore(),
      `${randomUUID()}_${masterA}`,
    ),
  );
  const guest2 = randomUUID();
  await assertFails(
    createConsultation(db, `${guest2}_${masterA}`, {
      guestId: guest2,
      clientAuthUid: "client-b",
    }),
  );
  await assertFails(
    createConsultation(db, `bad_${masterA}`, { guestId: "bad" }),
  );
  const guest3 = randomUUID();
  await assertFails(
    createConsultation(db, `${guest3}_${masterB}`, {
      guestId: guest3,
      masterId: masterB,
    }),
  );
  const guest4 = randomUUID(),
    bareId = `${guest4}_${masterA}`;
  await assertFails(
    setDoc(doc(db, "chats", bareId), {
      ...room(bareId),
      guestId: guest4,
      lastMessageAt: serverTimestamp(),
    }),
  );
});

async function send(db, senderRole, patch = {}, messagePatch = {}) {
  const id = "message-" + randomUUID(),
    batch = writeBatch(db);
  const previous = (await getDoc(doc(db, "chats", roomId))).data();
  const counter =
    senderRole === "cliente" ? "unreadByMaster" : "unreadByClient";
  const outgoing = {
    ...message(id, senderRole === "cliente" ? guest : masterA, senderRole),
    ...messagePatch,
  };
  for (const key of Object.keys(outgoing))
    if (outgoing[key] === undefined) delete outgoing[key];
  batch.set(doc(db, "chats", roomId, "messages", id), outgoing);
  batch.update(doc(db, "chats", roomId), {
    lastMessage: "Mensaje de prueba",
    lastMessageId: id,
    lastMessageAt: serverTimestamp(),
    [counter]: previous[counter] + 1,
    ...patch,
  });
  return batch.commit();
}
test("message transactions enforce sender, immutable membership, counters, timestamps and append-only history", async () => {
  const clientDb = client("client-a").firestore(),
    masterDb = staff(masterA).firestore();
  await assertSucceeds(send(clientDb, "cliente"));
  await assertSucceeds(send(masterDb, "maestro"));
  await assertFails(send(clientDb, "maestro"));
  await assertFails(send(clientDb, "cliente", { masterId: masterB }));
  await assertFails(send(clientDb, "cliente", { unreadByClient: 50 }));
  await assertFails(send(clientDb, "cliente", {}, { text: "" }));
  await assertFails(
    send(clientDb, "cliente", {}, { createdAt: Timestamp.fromMillis(0) }),
  );
  await assertFails(
    updateDoc(doc(clientDb, "chats", roomId, "messages", "initial-message"), {
      text: "Reescritura",
    }),
  );
  await assertFails(
    deleteDoc(doc(masterDb, "chats", roomId, "messages", "initial-message")),
  );
  await assertSucceeds(
    updateDoc(doc(masterDb, "chats", roomId), { statusTag: "Interesado" }),
  );
  await assertFails(
    updateDoc(doc(clientDb, "chats", roomId), { statusTag: "Pagado" }),
  );
  await assertFails(
    updateDoc(doc(masterDb, "chats", roomId), { statusTag: "Inválida" }),
  );
  await assertSucceeds(
    updateDoc(doc(masterDb, "chats", roomId), { unreadByMaster: 0 }),
  );
  await assertFails(
    updateDoc(doc(masterDb, "chats", roomId), { unreadByClient: 0 }),
  );
  await assertSucceeds(
    updateDoc(doc(clientDb, "chats", roomId), { unreadByClient: 0 }),
  );
});

test("media messages reject attachments belonging to another room", async () => {
  const db = client("client-a").firestore();
  const id = "media-" + randomUUID(),
    path = `chat_media/${roomId}/test.jpg`;
  const batch = writeBatch(db),
    previous = (await getDoc(doc(db, "chats", roomId))).data();
  batch.set(doc(db, "chats", roomId, "messages", id), {
    id,
    senderId: guest,
    senderRole: "cliente",
    type: "image",
    createdAt: serverTimestamp(),
    storagePath: path,
    mediaUrl: `https://firebasestorage.googleapis.com/v0/b/demo-santuario-astral.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=test`,
  });
  batch.update(doc(db, "chats", roomId), {
    lastMessage: "Foto",
    lastMessageId: id,
    lastMessageAt: serverTimestamp(),
    unreadByMaster: previous.unreadByMaster + 1,
  });
  await assertSucceeds(batch.commit());
  await assertFails(
    send(
      db,
      "cliente",
      {},
      {
        type: "image",
        text: undefined,
        storagePath: `chat_media/other/file.jpg`,
        mediaUrl:
          "https://firebasestorage.googleapis.com/v0/b/demo/o/chat_media%2Fother%2Ffile.jpg?alt=media",
      },
    ),
  );
});

test("Storage isolates rooms, enforces MIME/size/ownership, prevents overwrites and permits admin supervision", async () => {
  const context = client("client-a"),
    storage = context.storage();
  const path = `chat_media/${roomId}/client-a_test.png`,
    bytes = new Uint8Array([137, 80, 78, 71]);
  const metadata = {
    contentType: "image/png",
    customMetadata: { ownerUid: "client-a", roomId },
  };
  await assertSucceeds(uploadBytes(ref(storage, path), bytes, metadata));
  await assertSucceeds(getMetadata(ref(staff(masterA).storage(), path)));
  await assertSucceeds(getMetadata(ref(staff("admin-a").storage(), path)));
  await assertFails(getMetadata(ref(client("client-b").storage(), path)));
  await assertFails(getMetadata(ref(staff(masterB).storage(), path)));
  await assertFails(
    getMetadata(ref(env.unauthenticatedContext().storage(), path)),
  );
  await assertFails(uploadBytes(ref(storage, path), bytes, metadata));
  await assertFails(
    uploadBytes(ref(storage, `chat_media/${roomId}/script.html`), bytes, {
      ...metadata,
      contentType: "text/html",
    }),
  );
  await assertFails(
    uploadBytes(ref(storage, `chat_media/${roomId}/spoof.png`), bytes, {
      ...metadata,
      customMetadata: { ownerUid: masterA, roomId },
    }),
  );
  await assertFails(
    uploadBytes(
      ref(storage, `chat_media/${roomId}/oversize.png`),
      new Uint8Array(5 * 1024 * 1024 + 1),
      metadata,
    ),
  );
  await assertSucceeds(
    uploadBytes(ref(storage, `chat_media/${roomId}/audio.webm`), bytes, {
      ...metadata,
      contentType: "audio/webm;codecs=opus",
    }),
  );
  await assertFails(
    uploadBytes(
      ref(storage, `chat_media/${roomId}/oversize.webm`),
      new Uint8Array(8 * 1024 * 1024 + 1),
      { ...metadata, contentType: "audio/webm" },
    ),
  );
  await assertFails(deleteObject(ref(staff(masterA).storage(), path)));
  await assertSucceeds(deleteObject(ref(storage, path)));
});

test("avatar uploads allow the assigned master and admin while rejecting other identities", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]),
    path = `master_avatars/${masterA}/avatar.png`;
  await assertSucceeds(
    uploadBytes(ref(staff(masterA).storage(), path), bytes, {
      contentType: "image/png",
      customMetadata: { ownerUid: masterA, masterId: masterA },
    }),
  );
  await assertSucceeds(
    getMetadata(ref(env.unauthenticatedContext().storage(), path)),
  );
  await assertFails(
    uploadBytes(
      ref(staff(masterB).storage(), `master_avatars/${masterA}/other.png`),
      bytes,
      { contentType: "image/png", customMetadata: { ownerUid: masterB, masterId: masterA } },
    ),
  );
  await assertSucceeds(
    uploadBytes(
      ref(staff("admin-a").storage(), `master_avatars/${masterB}/admin.png`),
      bytes,
      { contentType: "image/png", customMetadata: { ownerUid: "admin-a", masterId: masterB } },
    ),
  );
});
