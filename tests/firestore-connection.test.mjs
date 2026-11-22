import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./chat-harness.mjs";

function connection({
  configured = true,
  empty = true,
  error,
  never = false,
} = {}) {
  const requests = [];
  const firestore = {
    collection: (_db, name) => ({ collection: name }),
    where: (field, operator, value) => ({ field, operator, value }),
    limit: (count) => ({ limit: count }),
    query: (...parts) => parts,
    getDocsFromServer: async (query) => {
      requests.push(query);
      if (error) throw error;
      if (never) return new Promise(() => {});
      return { empty };
    },
  };
  const api = evaluate("src/lib/firestoreConnection.ts", {
    require: (name) => {
      if (name === "@/lib/firebaseEnvironment")
        return { isFirebaseConfigured: () => configured };
      if (!configured)
        assert.fail("No SDK should be loaded without configuration.");
      if (name === "@/lib/firebase") return { db: {} };
      if (name === "firebase/firestore") return firestore;
      throw new Error("Unexpected SDK import: " + name);
    },
  });
  return { api, requests };
}

test("a missing Firebase configuration requires no SDK or network request", async () => {
  const h = connection({ configured: false });
  assert.equal(
    (await h.api.checkFirestoreConnection()).status,
    "not-configured",
  );
  assert.equal(h.requests.length, 0);
});
test("an empty public catalog is a successful Firestore connection", async () => {
  for (const empty of [true, false]) {
    const h = connection({ empty });
    const result = await h.api.checkFirestoreConnection();
    assert.equal(result.status, "connected");
    assert.equal(result.hasMasters, !empty);
    assert.equal(h.requests[0][0].collection, "masters");
    assert.equal(h.requests[0][1].field, "isActive");
    assert.equal(h.requests[0][1].value, true);
    assert.equal(h.requests[0][2].limit, 1);
  }
});
test("permissions, offline requests and timeouts become recoverable UI states", async () => {
  const denied = connection({ error: { code: "permission-denied" } });
  assert.equal(
    (await denied.api.checkFirestoreConnection()).reason,
    "permissions",
  );
  const offline = connection({ error: { code: "unavailable" } });
  assert.equal(
    (await offline.api.checkFirestoreConnection()).reason,
    "connection",
  );
  const hanging = connection({ never: true });
  assert.equal(
    (await hanging.api.checkFirestoreConnection(5)).status,
    "unavailable",
  );
});
test("cloud profile validation rejects data URLs before provisioning a real account", () => {
  const media = evaluate("src/lib/mediaUploads.ts", {});
  const validation = evaluate("src/lib/masterValidation.ts", {
    require: (name) => {
      assert.equal(name, "@/lib/mediaUploads");
      return media;
    },
  });
  const profile = {
    name: "Guía de prueba",
    bio: "Biografía de prueba",
    specialties: ["Tarot"],
    experienceYears: 1,
    login: "guide@example.test",
    password: "ClaveDePrueba2026!",
    avatarUrl: "data:image/png;base64,YQ==",
    isTestProfile: true,
  };
  assert.equal(media.CLOUD_MEDIA_UPLOADS_ENABLED, false);
  assert.throws(
    () => validation.validateMasterInput(profile, true, true),
    /URL HTTPS/,
  );
  assert.equal(
    validation.validateMasterInput(
      { ...profile, avatarUrl: "https://example.test/avatar.jpg" },
      true,
      true,
    ).avatarUrl,
    "https://example.test/avatar.jpg",
  );
  assert.equal(
    validation.validateMasterInput(profile, true, false).avatarUrl,
    profile.avatarUrl,
  );
});
