import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, createHarness, flush } from "./chat-harness.mjs";

const notifications = () => evaluate("src/lib/chatNotifications.ts", {});
const room = (id = "guest_master", message = "initial", extra = {}) => ({
  id, guestId: "guest", masterId: "master", clientName: "Cliente", masterName: "Maestro",
  unreadByMaster: 1, unreadByClient: 0, lastMessageId: message, ...extra,
});
const message = (id, senderRole = "cliente", senderId = senderRole === "cliente" ? "guest" : "master") => ({ id, senderRole, senderId });
const snapshot = (rooms, readMessage, extra = {}) => ({
  owner: "master:1", role: "maestro", rooms, confirmed: true, readMessage, ...extra,
});

test("cached and initial server history stay silent; messages, new intakes and media alert once after sender verification", async () => {
  const events = [], reads = [];
  const tracker = notifications().createInboxTracker(notice => events.push(notice));
  const read = async value => { reads.push(value.lastMessageId); return message(value.lastMessageId); };
  tracker.accept(snapshot([room()], read, { confirmed: false }));
  tracker.accept(snapshot([room("guest_master", "server-history")], read));
  assert.equal(events.length, 0);
  assert.equal(reads.length, 0);
  tracker.accept(snapshot([room("guest_master", "incoming")], read, { confirmed: false }));
  tracker.accept(snapshot([room("guest_master", "incoming", { unreadByMaster: 0 })], read));
  tracker.accept(snapshot([room("guest_master", "incoming", { unreadByMaster: 0 })], read));
  await flush();
  assert.equal(events.length, 1, "read receipts cannot swallow a just-arrived message");
  assert.deepEqual(reads, ["incoming"]);
  tracker.accept(snapshot([room("guest_master", "incoming", { statusTag: "Pagado" })], read));
  tracker.accept(snapshot([room("guest_master", "own")], async () => message("own", "maestro")));
  tracker.accept(snapshot([room("guest_master", "foreign")], async () => message("foreign", "cliente", "somebody-else")));
  tracker.accept(snapshot([room("guest_master", "wrong-id")], async () => message("different")));
  await flush();
  assert.equal(events.length, 1);
  tracker.accept(snapshot([room("guest_master", "image")], async () => ({ ...message("image"), type: "image" })));
  tracker.accept(snapshot([room("other_master", "intake_request", { guestId: "other" })], async () => message("intake_request", "cliente", "other")));
  await flush();
  assert.equal(events.length, 3);
  assert.equal(events.at(-1).roomId, "other_master");
});

test("client alerts ignore their own intake and cannot cross room, owner or teardown boundaries", async () => {
  const events = [];
  const tracker = notifications().createInboxTracker(notice => events.push(notice));
  const client = (rooms, readMessage, owner = "client:1") => snapshot(rooms, readMessage, { owner, role: "cliente" });
  tracker.accept(client([], async () => null));
  tracker.accept(client([room("guest_master", "intake")], async () => message("intake")));
  await flush();
  assert.equal(events.length, 0);
  tracker.accept(client([room("guest_master", "reply")], async () => message("reply", "maestro")));
  await flush();
  assert.equal(events.length, 1);
  let finish;
  tracker.accept(client([room("guest_master", "late")], () => new Promise(resolve => { finish = resolve; })));
  tracker.accept(client([room("other_master", "old-history")], async () => message("old-history", "maestro"), "client:2"));
  finish(message("late", "maestro"));
  await flush();
  assert.equal(events.length, 1);
  tracker.accept(client([room("other_master", "audio")], async () => ({ ...message("audio", "maestro"), type: "audio" }), "client:2"));
  tracker.stop();
  await flush();
  assert.equal(events.length, 1);
});

test("sound claims coordinate independent tabs, are owner-scoped and tolerate blocked storage", async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let queue = Promise.resolve();
  const locks = { request: (_key, action) => { const result = queue.then(action); queue = result.catch(() => {}); return result; } };
  const tab = () => evaluate("src/lib/chatNotifications.ts", { window: { localStorage: storage }, navigator: { locks } });
  const a = tab(), b = tab();
  assert.deepEqual(await Promise.all([a.claimNotificationSound("owner", "r:m1"), b.claimNotificationSound("owner", "r:m1")]), [true, false]);
  assert.equal(await a.claimNotificationSound("different", "r:m1"), true);
  const denied = evaluate("src/lib/chatNotifications.ts", {
    window: { localStorage: { getItem: () => { throw new Error("Denied"); } } }, navigator: {},
  });
  assert.equal(await denied.claimNotificationSound("owner", "r:m1"), true);
  assert.equal(await denied.claimNotificationSound("owner", "r:m1"), false);
});

test("local inbox stays scoped and updates on new replies, read receipts and consultations", async () => {
  const h = createHarness();
  const id = await h.createRoom();
  const inbox = h.loadModule("@/lib/chatInbox");
  const received = [], alerts = [];
  const tracker = notifications().createInboxTracker(value => alerts.push(value));
  const stop = inbox.subscribeChatInbox(null, state => { received.push(state); tracker.accept(state); }, assert.fail);
  await flush();
  assert.equal(received.at(-1).confirmed, true);
  assert.equal(received.at(-1).rooms.length, 1);
  assert.equal(alerts.length, 0);
  const record = h.consultations.readLocalConsultation(id);
  const reply = { id: "reply", senderRole: "maestro", senderId: record.room.masterId, type: "text", text: "Prueba", createdAt: new Date().toISOString() };
  h.consultations.writeLocalConsultation({ ...record, room: { ...record.room, lastMessageId: reply.id, unreadByClient: 1 }, messages: [...record.messages, reply] });
  await flush();
  assert.equal(alerts.length, 1);
  assert.equal(received.at(-1).rooms[0].unreadByClient, 1);
  await h.service.markChatRead(id, { messageId: "reply", lastMessageAt: record.room.lastMessageAt });
  await flush();
  assert.equal(received.at(-1).rooms[0].unreadByClient, 0);
  assert.equal(alerts.length, 1);
  stop(); tracker.stop();
  const count = received.length;
  h.window.dispatchEvent(new Event("focus"));
  await flush();
  assert.equal(received.length, count);
});

test("Firestore inbox uses participant queries, separates cache from committed state and cancels on auth changes", async () => {
  for (const staffMode of [false, true]) {
    const h = createHarness(true);
    const id = await h.createRoom();
    const stored = h.cloud.get(`chats/${id}`);
    if (staffMode) h.auth.currentUser = { uid: stored.masterId };
    const staff = staffMode ? { uid: stored.masterId, masterId: stored.masterId, mode: "firebase", role: "maestro" } : null;
    let listener, authListener, stopped = 0;
    const received = [], errors = [];
    const firestore = {
      collection: (_db, name) => name,
      where: (field, operator, value) => ({ field, operator, value }),
      query: (collection, filter) => ({ collection, filter }),
      onSnapshot: (query, options, next) => { listener = { query, options, next }; return () => stopped++; },
    };
    const source = evaluate("src/lib/chatInbox.ts", {
      window: h.window,
      require: name => name === "@/lib/firebaseEnvironment" ? { isFirebaseConfigured: () => true }
        : name === "@/lib/chatIdentity" ? { ensureVisitorUser: async () => h.auth.currentUser }
        : name === "@/lib/guestSession" ? { getOrCreateGuestId: () => h.guest }
        : name === "@/lib/staffAuth" ? { requireStaff: async () => staff }
        : name === "@/lib/consultations" ? h.consultations
        : name === "@/lib/firebase" ? { auth: h.auth, db: {} }
        : name === "@/lib/staffFirebase" ? { staffAuth: h.auth, staffDb: {} }
        : name === "firebase/firestore" ? firestore
        : name === "firebase/auth" ? { onAuthStateChanged: (_auth, next) => { authListener = next; return () => stopped++; } }
        : assert.fail(name),
    });
    const stop = source.subscribeChatInbox(staff, state => received.push(state), error => errors.push(error));
    await flush(); await flush();
    assert.equal(listener.query.filter.field, staffMode ? "masterId" : "clientAuthUid");
    assert.equal(listener.query.filter.value, h.auth.currentUser.uid);
    assert.equal(listener.options.includeMetadataChanges, true);
    const emit = metadata => listener.next({ docs: [{ id, data: () => stored }], metadata });
    emit({ fromCache: true, hasPendingWrites: false });
    assert.equal(received.at(-1).confirmed, false);
    emit({ fromCache: false, hasPendingWrites: true });
    assert.equal(received.at(-1).confirmed, false);
    emit({ fromCache: false, hasPendingWrites: false });
    assert.equal(received.at(-1).confirmed, true);
    assert.equal(received.at(-1).rooms.length, 1);
    h.auth.currentUser = { uid: "different" };
    authListener(h.auth.currentUser);
    assert.equal(errors.length, 1);
    assert.equal(stopped, 2);
    const length = received.length;
    emit({ fromCache: false, hasPendingWrites: false });
    assert.equal(received.length, length);
    stop();
  }
});

test("sound waits for interaction, handles autoplay rejection, throttles bursts and respects mute and teardown", async () => {
  const values = new Map(), statuses = [], contexts = [];
  let blocked = true, tones = 0;
  class Audio {
    state = "suspended"; currentTime = 1; destination = {};
    constructor() { contexts.push(this); }
    async resume() { if (blocked) throw new Error("NotAllowedError"); this.state = "running"; }
    createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { tones++; }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    async close() { this.state = "closed"; }
  }
  const sound = evaluate("src/lib/notificationSound.ts", {
    window: { AudioContext: Audio, localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } },
  }).createNotificationSound(status => statuses.push(status));
  assert.equal(contexts.length, 0);
  assert.equal(sound.play("cliente"), false);
  assert.equal(await sound.enable(), false);
  assert.equal(statuses.at(-1), "locked");
  blocked = false;
  assert.equal(await sound.enable(), true);
  assert.equal(tones, 0, "unlocking must not replay old messages");
  assert.equal(sound.play("cliente"), true);
  assert.equal(sound.play("cliente"), false);
  contexts[0].currentTime += 1;
  assert.equal(sound.play("maestro"), true);
  sound.mute();
  assert.equal(await sound.enable(true), false);
  assert.equal(sound.play("maestro"), false);
  assert.equal(statuses.at(-1), "muted");
  await sound.enable();
  sound.dispose();
  assert.equal(sound.play("cliente"), false);
  assert.equal(tones, 2);
});
