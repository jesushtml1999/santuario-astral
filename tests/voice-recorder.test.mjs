import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./chat-harness.mjs";

function fixture(permission) {
  let stopped = 0,
    now = 0,
    created = 0;
  const revoked = [],
    timers = new Set();
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  class Recorder {
    static isTypeSupported = (mime) => mime.startsWith("audio/webm");
    constructor(_stream, options) {
      this.state = "inactive";
      this.mimeType = options?.mimeType ?? "audio/webm";
      created++;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["test-audio"], { type: this.mimeType }),
      });
      this.onstop?.();
    }
  }
  const { VoiceRecorderController } = evaluate("src/lib/voiceRecorder.ts", {
    MediaRecorder: Recorder,
    navigator: {
      mediaDevices: {
        getUserMedia: () =>
          permission ? permission(stream) : Promise.resolve(stream),
      },
    },
    performance: { now: () => now },
    URL: {
      createObjectURL: () => "blob:voice-preview",
      revokeObjectURL: (value) => revoked.push(value),
    },
    setInterval: (callback) => {
      timers.add(callback);
      return callback;
    },
    clearInterval: (callback) => timers.delete(callback),
  });
  return {
    controller: new VoiceRecorderController(),
    stream,
    revoked,
    timers,
    get stopped() {
      return stopped;
    },
    get created() {
      return created;
    },
    tick: (value) => {
      now = value;
      [...timers].forEach((callback) => callback());
    },
  };
}

test("stop produces a preview and releases microphone/timers; cancel revokes it", async () => {
  const f = fixture();
  await f.controller.start();
  assert.equal(f.controller.getSnapshot().status, "recording");
  await f.controller.start();
  assert.equal(f.created, 1);
  f.controller.stop();
  assert.equal(f.controller.getSnapshot().status, "preview");
  assert.ok(f.controller.getSnapshot().blob.size > 0);
  assert.equal(f.stopped, 1);
  assert.equal(f.timers.size, 0);
  f.controller.cancel();
  assert.equal(f.controller.getSnapshot().status, "idle");
  assert.equal(f.controller.getSnapshot().blob, null);
  assert.deepEqual(f.revoked, ["blob:voice-preview"]);
});

test("cancel or route teardown during recording never produces a sendable draft", async () => {
  const f = fixture();
  await f.controller.start();
  f.controller.cancel();
  assert.equal(f.stopped, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.controller.getSnapshot().blob, null);
  await f.controller.start();
  assert.equal(f.created, 2);
  f.controller.cancel();
  assert.equal(f.stopped, 2);
});

test("late permission results are stopped after cancellation", async () => {
  let grant;
  const f = fixture(
    (stream) =>
      new Promise((resolve) => {
        grant = () => resolve(stream);
      }),
  );
  const starting = f.controller.start();
  assert.equal(f.controller.getSnapshot().status, "requesting");
  f.controller.cancel();
  grant();
  await starting;
  assert.equal(f.stopped, 1);
  assert.equal(f.created, 0);
  assert.equal(f.controller.getSnapshot().status, "idle");
});

test("permission denial is recoverable and the duration limit stops recording", async () => {
  const denied = fixture(() =>
    Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
  );
  await denied.controller.start();
  assert.equal(denied.controller.getSnapshot().status, "idle");
  assert.match(denied.controller.getSnapshot().error, /Permite el micrófono/);
  const limited = fixture();
  await limited.controller.start();
  limited.tick(120001);
  assert.equal(limited.controller.getSnapshot().status, "preview");
  assert.equal(limited.controller.getSnapshot().seconds, 120);
  assert.equal(limited.stopped, 1);
  assert.equal(limited.timers.size, 0);
  limited.controller.cancel();
});
