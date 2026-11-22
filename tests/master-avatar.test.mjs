import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { evaluate } from "./chat-harness.mjs";

const photo = () =>
  new Blob([fs.readFileSync("tests/fixtures/chat-photo.png")], {
    type: "image/png",
  });
function harness(role = "admin") {
  const session = {
    uid: role === "admin" ? "admin-a" : "master-a",
    role,
    masterId: role === "maestro" ? "master-a" : undefined,
    mode: "firebase",
  };
  const auth = {
    app: { name: "staff-app" },
    currentUser: { uid: session.uid },
  };
  const uploads = [],
    control = { fail: false, duringUpload: null, canceled: false };
  const service = evaluate("src/lib/masterAvatar.ts", {
    crypto: crypto.webcrypto,
    require: (name) => {
      if (name === "@/lib/staffAuth")
        return { requireStaff: async () => session };
      if (name === "@/lib/staffFirebase") return { staffAuth: auth };
      if (name === "firebase/storage")
        return {
          getStorage: (app) => {
            assert.equal(app, auth.app);
            return {};
          },
          ref: (_storage, path) => ({ path }),
          getDownloadURL: async (ref) =>
            `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(ref.path)}`,
          uploadBytesResumable: (ref, file, metadata) => {
            uploads.push({ ref, file, metadata });
            let listening = true;
            return {
              cancel: () => {
                control.canceled = true;
              },
              on: (_event, progress, error, complete) => {
                queueMicrotask(() => {
                  if (!listening) return;
                  control.duringUpload?.();
                  if (!listening) return;
                  if (control.fail)
                    error(
                      Object.assign(new Error("denied"), {
                        code: "storage/unauthorized",
                      }),
                    );
                  else {
                    progress({ bytesTransferred: 1, totalBytes: 2 });
                    if (listening) complete();
                  }
                });
                return () => {
                  listening = false;
                };
              },
            };
          },
        };
      throw new Error(name);
    },
  });
  return { service, session, auth, uploads, control };
}

test("avatar validates actual file signature, MIME and a 5 MB maximum before contacting Storage", async () => {
  const h = harness();
  for (const file of [
    new Blob([], { type: "image/png" }),
    new Blob(["renamed html"], { type: "image/png" }),
    new Blob(["gif"], { type: "image/gif" }),
    new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }),
  ])
    await assert.rejects(h.service.uploadMasterAvatar(file, "master-a"));
  assert.equal(h.uploads.length, 0);
  assert.equal(await h.service.validateAvatarFile(photo()), "png");
  assert.equal(
    await h.service.validateAvatarFile(
      new Blob([new Uint8Array([255, 216, 255, 0])], { type: "image/jpeg" }),
    ),
    "jpg",
  );
  assert.equal(
    await h.service.validateAvatarFile(
      new Blob(["RIFF0000WEBP"], { type: "image/webp" }),
    ),
    "webp",
  );
});

test("admin uploads use staff auth, unique master paths, scoped metadata and progress; new profiles support drafts", async () => {
  const h = harness(),
    progress = [];
  const url = await h.service.uploadMasterAvatar(photo(), "initial-luna", {
    onProgress: (value) => progress.push(value),
  });
  const draft = await h.service.uploadMasterAvatar(photo());
  assert.match(
    h.uploads[0].ref.path,
    /^master_avatars\/initial-luna\/[a-f0-9-]+\.png$/,
  );
  assert.equal(h.uploads[0].metadata.customMetadata.ownerUid, "admin-a");
  assert.equal(h.uploads[0].metadata.customMetadata.masterId, "initial-luna");
  assert.equal(h.uploads[0].metadata.contentType, "image/png");
  assert.ok(url.startsWith("https://"));
  assert.ok(draft.includes("draft-admin-a"));
  assert.equal(progress.at(-1), 100);
});

test("a master can upload only their own avatar and canceled or changed sessions never return a URL", async () => {
  const h = harness("maestro");
  await assert.rejects(
    h.service.uploadMasterAvatar(photo(), "other-master"),
    /otro maestro/,
  );
  assert.equal(h.uploads.length, 0);
  const abort = new AbortController();
  h.control.duringUpload = () => abort.abort();
  await assert.rejects(
    h.service.uploadMasterAvatar(photo(), "master-a", { signal: abort.signal }),
    { name: "AbortError" },
  );
  assert.equal(h.control.canceled, true);
  h.control.duringUpload = () => {
    h.auth.currentUser = { uid: "other-master" };
  };
  await assert.rejects(
    h.service.uploadMasterAvatar(photo(), "master-a"),
    /sesión cambió/,
  );
});

test("Storage permission failures propagate and provide a clear retryable error", async () => {
  const h = harness();
  h.control.fail = true;
  let failure;
  try {
    await h.service.uploadMasterAvatar(photo(), "master-a");
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, "storage/unauthorized");
  assert.match(h.service.avatarErrorMessage(failure), /permiso/);
  h.control.fail = false;
  assert.ok(await h.service.uploadMasterAvatar(photo(), "master-a"));
});
