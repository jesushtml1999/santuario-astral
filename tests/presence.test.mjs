import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase/firestore";
import { evaluate, createHarness, flush } from "./chat-harness.mjs";

const policy = evaluate("src/lib/presence.ts", {});
const command = (action, connectionId, available) => ({ action, connectionId,
  ...(available === undefined ? {} : { available }) });

test("leases keep another device online, expire after crashes, and block late resurrection", () => {
  const a = randomUUID(), b = randomUUID(), now = Date.now();
  let result = policy.nextPresence(null, command("connect", a), now);
  result = policy.nextPresence(result.state, command("connect", b), now + 1);
  result = policy.nextPresence(result.state, command("disconnect", a), now + 2);
  assert.equal(result.isOnline, true);
  assert.throws(() => policy.nextPresence(result.state, command("heartbeat", a), now + 3), e => e.status === 409);
  assert.throws(() => policy.nextPresence(result.state, command("connect", a), now + 3), e => e.status === 409);
  assert.equal(policy.masterIsOnline({ isOnline: true, presenceExpiresAt: result.expiresAt }, true, now + policy.PRESENCE_LEASE_MS + 2), false);
  result = policy.nextPresence(result.state, command("disconnect", b), now + 4);
  assert.equal(result.isOnline, false);
  assert.equal(result.expiresAt, 0);
  assert.equal(policy.masterIsOnline({ isOnline: true }, true), false);
});

test("heartbeats respect manual busy and reconnecting creates a fresh online session", () => {
  const id = randomUUID(), now = Date.now();
  let r = policy.nextPresence(null, command("connect", id), now);
  r = policy.nextPresence(r.state, command("availability", id, false), now + 1);
  r = policy.nextPresence(r.state, command("heartbeat", id), now + 2);
  assert.equal(r.isOnline, false);
  r = policy.nextPresence(r.state, command("availability", id, true), now + 3);
  assert.equal(r.isOnline, true);
  assert.throws(() => policy.nextPresence(r.state, command("heartbeat", id), now + policy.PRESENCE_LEASE_MS + 4), e => e.status === 409);
  r = policy.nextPresence(r.state, command("connect", randomUUID()), now + policy.PRESENCE_LEASE_MS + 4);
  assert.equal(r.isOnline, true);
  assert.equal(Object.keys(r.state.connections).length, 1);
});

test("presence payloads reject foreign identities, unknown fields and malformed ids", () => {
  for (const value of [null, {}, command("connect", "../other"),
    { ...command("connect", randomUUID()), masterId: "other" },
    command("availability", randomUUID(), "true"), command("unexpected", randomUUID())])
    assert.throws(() => policy.presenceCommand(value), e => e.status === 400);
  assert.equal(policy.presenceExpiry(Timestamp.fromMillis(100)), 100);
  assert.equal(policy.presenceExpiry({ toMillis: () => { throw Error(); } }), undefined);
});

test("catalog and chat turn a crashed connection off without another server write", async () => {
  const h = createHarness(true), room = await h.createRoom(0);
  h.cloud.set("masters/master-0", { ...h.cloud.get("masters/master-0"),
    isOnline: true, presenceExpiresAt: Timestamp.fromMillis(Date.now() + 250) });
  const catalog = [], chats = [];
  const stopCatalog = h.publicMasters.subscribeMasters(v => catalog.push(v));
  const stopChat = h.service.subscribeToChat(room, v => chats.push(v), assert.fail);
  try {
    await flush(); await flush(); await flush();
    assert.equal(catalog.at(-1).masters.find(p => p.id === "master-0").isOnline, true);
    assert.equal(chats.at(-1).isOnline, true);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(catalog.at(-1).masters.find(p => p.id === "master-0").isOnline, false);
    assert.equal(chats.at(-1).isOnline, false);
  } finally { stopCatalog(); stopChat(); }
});

test("browser presence handles page hide, BFCache restore, offline/online and cleanup", async (t) => {
  let state = null, latest;
  const calls = [];
  const send = async (cmd, leaving) => {
    calls.push({ ...cmd, leaving });
    latest = policy.nextPresence(state, cmd, Date.now());
    state = latest.state;
  };
  const createTab = () => {
    const window = new EventTarget(), document = new EventTarget();
    window.navigator = { onLine: true };
    window.crypto = { randomUUID };
    document.visibilityState = "visible";
    const client = evaluate("src/lib/staffPresence.ts", {
      window, document, require: name => {
        assert.equal(name, "@/lib/presence"); return policy;
      },
    });
    const stop = client.startMasterPresence({ uid: "master", masterId: "master", role: "maestro", mode: "firebase" }, send);
    t.after(() => client.stopMasterPresence());
    return { window, client, stop };
  };
  const a = createTab(), b = createTab();
  await flush();
  assert.equal(Object.values(state.connections).filter(v => v.connected).length, 2);
  a.window.dispatchEvent(new Event("pagehide")); await flush();
  assert.equal(latest.isOnline, true);
  await b.client.stopMasterPresence();
  assert.equal(latest.isOnline, false);
  a.window.dispatchEvent(new Event("pageshow")); await flush();
  assert.equal(latest.isOnline, true);
  a.window.navigator.onLine = false;
  a.window.dispatchEvent(new Event("offline")); await flush();
  assert.equal(latest.isOnline, false);
  a.window.navigator.onLine = true;
  a.window.dispatchEvent(new Event("online")); await flush();
  assert.equal(latest.isOnline, true);
  await a.client.stopMasterPresence();
  const count = calls.length;
  a.window.dispatchEvent(new Event("focus")); await flush();
  assert.equal(calls.length, count);
  assert.ok(calls.some(c => c.action === "disconnect" && c.leaving));
});

test("demo login presence becomes online, preserves busy on heartbeats and goes offline on logout", async (t) => {
  const h = createHarness(), document = new EventTarget();
  h.window.navigator = { onLine: true };
  document.visibilityState = "visible";
  const client = evaluate("src/lib/staffPresence.ts", {
    window: h.window, document, require: name => {
      if (name === "@/lib/presence") return policy;
      if (name === "@/lib/localMasters") return h.localMasters;
      throw Error(name);
    },
  });
  t.after(() => client.stopMasterPresence());
  const master = h.masters[2];
  const session = { uid: "staff-" + master.id, masterId: master.id, role: "maestro", mode: "local" };
  client.startMasterPresence(session);
  await flush(); await flush();
  const own = () => h.localMasters.readLocalMasters().find(p => p.id === master.id);
  assert.equal(own().isOnline, true);
  await client.setMasterPresenceAvailability(session, false);
  h.window.dispatchEvent(new Event("focus")); await flush(); await flush();
  assert.equal(own().isOnline, false);
  await client.setMasterPresenceAvailability(session, true);
  assert.equal(own().isOnline, true);
  await client.stopMasterPresence();
  assert.equal(own().isOnline, false);
});

test("a late rejected heartbeat cannot close the fresh connection created after restore", async (t) => {
  const window = new EventTarget(), document = new EventTarget();
  window.navigator = { onLine: true };
  window.crypto = { randomUUID };
  let rejectOld, heartbeats = 0, connections = 0;
  const client = evaluate("src/lib/staffPresence.ts", {
    window, document, require: () => policy,
  });
  t.after(() => client.stopMasterPresence());
  client.startMasterPresence({ uid: "m", masterId: "m", role: "maestro", mode: "firebase" }, async cmd => {
    if (cmd.action === "connect") connections++;
    if (cmd.action === "heartbeat") {
      heartbeats++;
      if (!rejectOld) await new Promise((_, reject) => { rejectOld = reject; });
    }
  });
  await flush();
  window.dispatchEvent(new Event("focus")); await flush();
  window.dispatchEvent(new Event("pagehide")); await flush();
  window.dispatchEvent(new Event("pageshow")); await flush();
  assert.equal(connections, 2);
  rejectOld(new policy.PresenceError("Expired", 409)); await flush();
  window.dispatchEvent(new Event("focus")); await flush();
  assert.equal(heartbeats, 2);
  assert.equal(connections, 2);
});

test("presence endpoint derives owner from verified auth and rejects admin, client and disabled roles", async () => {
  const data = new Map([
    ["users/master", { role: "maestro", masterId: "master" }],
    ["masters/master", { isActive: true }],
    ["users/admin", { role: "admin" }],
    ["users/client", { role: "cliente" }],
    ["users/disabled", { role: "maestro", masterId: "disabled", disabled: true }],
  ]);
  class StaffApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const snapshot = ref => ({ exists: data.has(ref.path), data: () => data.get(ref.path) });
  const services = {
    auth: { verifyIdToken: async token => { if (token === "bad") throw Error(); return { uid: token }; } },
    db: { doc: path => ({ path }), runTransaction: async work => {
      const writes = [];
      const result = await work({ getAll: async (...refs) => refs.map(snapshot),
        set: (ref, value) => writes.push([ref.path, value]),
        update: (ref, value) => writes.push([ref.path, { ...data.get(ref.path), ...value }]),
      });
      for (const [path, value] of writes) data.set(path, value);
      return result;
    } },
  };
  const server = evaluate("src/lib/server/masterPresence.ts", { require: name => {
    if (name === "server-only") return {};
    if (name === "firebase-admin/firestore") return { Timestamp };
    if (name === "@/lib/presence") return policy;
    assert.equal(name, "@/lib/server/firebaseAdmin");
    return { getAdminServices: () => services, StaffApiError };
  } });
  const request = (token, value, origin) => new Request("https://santuario.test/api/staff/presence", {
    method: "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) },
    body: JSON.stringify(value),
  });
  for (const token of [undefined, "bad", "admin", "client", "disabled"])
    await assert.rejects(server.updateMasterPresence(request(token, command("connect", randomUUID()))));
  await assert.rejects(server.updateMasterPresence(request("master", command("connect", randomUUID()), "https://evil.test")));
  assert.equal(data.has("staffPresence/master"), false);
  const a = randomUUID(), b = randomUUID();
  await server.updateMasterPresence(request("master", command("connect", a)));
  await server.updateMasterPresence(request("master", command("connect", b)));
  assert.equal(data.get("masters/master").isOnline, true);
  await server.updateMasterPresence(request("master", command("disconnect", a)));
  assert.equal(data.get("masters/master").isOnline, true);
  await server.updateMasterPresence(request("master", command("disconnect", b)));
  assert.equal(data.get("masters/master").isOnline, false);
  assert.equal(data.get("masters/master").presenceExpiresAt.toMillis(), 0);
  assert.equal(data.has("masters/admin"), false);
});
