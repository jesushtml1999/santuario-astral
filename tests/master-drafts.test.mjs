import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./chat-harness.mjs";

const validation = evaluate("src/lib/masterValidation.ts", {
  require: (name) => {
    assert.equal(name, "@/lib/mediaUploads");
    return { assertHostedAvatar: () => {} };
  },
});
const input = {
  id: "initial-luna-valencia", name: "Nombre elegido por administración",
  specialties: ["Tarot"], bio: "Biografía revisada", experienceYears: 0,
  avatarUrl: "", login: "", isTestProfile: true,
};

function harness({ failCommit = 0, failEnable = false } = {}) {
  const data = new Map([
    ["masters/" + input.id, { id: input.id, name: "Luna Valencia", isActive: false }],
    ["users/" + input.id, { role: "maestro", masterId: input.id, disabled: true, accessPending: true, email: "" }],
  ]);
  const account = { disabled: true, displayName: "Luna Valencia" };
  let commits = 0;
  const db = {
    doc: (path) => ({ path, get: async () => ({ exists: data.has(path), data: () => data.get(path) }) }),
    batch: () => {
      const writes = [];
      const batch = {
        update: (ref, fields) => { writes.push([ref.path, fields]); return batch; },
        set: (ref, fields) => { writes.push([ref.path, fields]); return batch; },
        commit: async () => {
          if (++commits === failCommit) throw new Error("Firestore unavailable");
          for (const [path, fields] of writes) data.set(path, { ...data.get(path), ...fields });
        },
      };
      return batch;
    },
  };
  const auth = {
    updateUser: async (_id, fields) => {
      if (fields.disabled === false) {
        assert.equal(data.get("users/" + input.id).disabled, true);
        if (failEnable) throw new Error("Auth unavailable");
      }
      Object.assign(account, fields);
    },
    revokeRefreshTokens: async () => {},
  };
  class StaffApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const route = evaluate("src/app/api/admin/masters/route.ts", {
    Response, Request,
    require: (name) => {
      if (name === "@/lib/server/firebaseAdmin") return { StaffApiError, authorizeAdmin: async () => ({ db, auth }) };
      if (name === "@/lib/masterValidation") return validation;
      if (name === "firebase-admin/firestore") return { FieldValue: { serverTimestamp: () => "server-time" } };
      throw new Error(name);
    },
  });
  const patch = (body) => route.PATCH(new Request("https://santuario.test/api/admin/masters", {
    method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  }));
  return { data, account, patch };
}

test("an initial draft can be renamed without creating credentials or publishing it", async () => {
  const h = harness();
  assert.equal((await h.patch(input)).status, 200);
  assert.equal(h.data.get("masters/" + input.id).name, input.name);
  assert.equal(h.data.get("masters/" + input.id).isActive, false);
  assert.equal(h.account.disabled, true);
  assert.equal(h.account.email, undefined);
  assert.equal(h.account.password, undefined);
  assert.equal(h.data.get("users/" + input.id).accessPending, true);
  assert.equal((await h.patch({ id: input.id, isActive: true })).status, 200);
  assert.equal(h.data.get("masters/" + input.id).isActive, true);
  assert.equal(h.account.disabled, true);
  assert.equal(h.data.get("users/" + input.id).disabled, true);
  assert.equal(h.data.get("users/" + input.id).accessPending, true);
  assert.equal((await h.patch({ id: input.id, isActive: false })).status, 200);
  assert.equal(h.data.get("masters/" + input.id).isActive, false);
});

test("draft activation requires both credentials and preserves the reserved identity", async () => {
  const h = harness();
  assert.equal((await h.patch({ id: input.id, isActive: true })).status, 200);
  assert.equal((await h.patch({ ...input, login: "master@example.test" })).status, 400);
  assert.equal((await h.patch({ ...input, password: "UniqueTestPassword12!" })).status, 400);
  assert.equal((await h.patch({ ...input, login: "master@example.test", password: "short" })).status, 400);
  assert.equal((await h.patch({ ...input, login: "master@example.test", password: "UniqueTestPassword12!" })).status, 200);
  const user = h.data.get("users/" + input.id);
  assert.equal(user.masterId, input.id);
  assert.equal(user.disabled, false);
  assert.equal(user.accessPending, false);
  assert.equal(user.password, undefined);
  assert.equal(h.account.disabled, false);
  assert.equal(h.data.get("masters/" + input.id).isActive, true);
});

test("partial activation failures keep the private role disabled and can be retried", async () => {
  for (const options of [{ failCommit: 1 }, { failCommit: 2 }, { failEnable: true }]) {
    const h = harness(options);
    const activate = { ...input, login: "master@example.test", password: "UniqueTestPassword12!" };
    assert.equal((await h.patch(activate)).status, 500);
    assert.equal(h.data.get("users/" + input.id).disabled, true);
    assert.equal(h.data.get("users/" + input.id).accessPending, true);
    assert.equal((await h.patch({ id: input.id, isActive: true })).status, 200);
    assert.equal(h.data.get("users/" + input.id).disabled, true);
    if (!options.failEnable) assert.equal((await h.patch(activate)).status, 200);
  }
});

test("an existing access still requires a valid login when editing a profile", () => {
  assert.throws(() => validation.validateMasterInput(input, false, true));
  assert.equal(validation.validateMasterInput(input, false, true, true).login, "");
  assert.throws(() => validation.validateMasterInput(input, true, true, true));
});

test("a public profile accepts an empty avatar and has no credential dependency", () => {
  const profile = validation.parseMaster(input.id, {
    ...input, specialty: "Tarot", rating: 0, reviewsCount: 0,
    isActive: true, isOnline: false,
  });
  assert.ok(profile);
  assert.equal(profile.avatarUrl, "");
  assert.equal(profile.isActive, true);
  assert.equal(profile.login, undefined);
  assert.equal(profile.password, undefined);
});
