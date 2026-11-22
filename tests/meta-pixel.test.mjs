import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { evaluate } from "./chat-harness.mjs";

function pixelHarness({
  id = "123456789012345",
  configured = false,
  storageBlocked = false,
  windowPresent = true,
} = {}) {
  const stored = new Map();
  const window = {
    location: { pathname: "/catalogo", search: "" },
    crypto: crypto.webcrypto,
    localStorage: {
      getItem: (key) => {
        if (storageBlocked) throw new Error("blocked");
        return stored.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (storageBlocked) throw new Error("blocked");
        stored.set(key, value);
      },
    },
  };
  const globals = {
    process: { env: { NEXT_PUBLIC_META_PIXEL_ID: id } },
    require: (name) => {
      assert.equal(name, "@/lib/firebaseEnvironment");
      return { isFirebaseConfigured: () => configured };
    },
    ...(windowPresent ? { window } : {}),
  };
  return {
    window,
    stored,
    globals,
    pixel: evaluate("src/lib/metaPixel.ts", globals),
  };
}

test("Pixel is inert during SSR and with missing or unsafe configuration", () => {
  for (const options of [
    { id: "" },
    { id: "123<script>alert(1)</script>" },
    { windowPresent: false },
  ]) {
    const h = pixelHarness(options);
    assert.doesNotThrow(() => {
      h.pixel.trackPageView();
      h.pixel.trackViewMaster("master", "Guía", "Tarot");
      h.pixel.trackStartConsultation("master", "Guía", "room");
      h.pixel.trackFirstMessageSent("room", "master");
    });
    assert.equal(h.window.fbq, undefined);
    assert.equal(h.stored.size, 0);
  }
});

test("queued events initialize once, deduplicate React effects and record route returns", () => {
  const h = pixelHarness();
  h.pixel.trackPageView();
  h.pixel.trackPageView();
  h.window.location.pathname = "/maestro/master-a";
  h.pixel.trackViewMaster("master-a", "Guía público", "Tarot");
  h.pixel.trackViewMaster("master-a", "Guía público", "Tarot");
  h.pixel.trackPageView();
  h.window.location.pathname = "/catalogo";
  h.pixel.trackPageView();
  const queue = h.window.fbq.queue;
  assert.equal(queue.filter((call) => call[0] === "init").length, 1);
  assert.equal(queue.filter((call) => call[2] === "PageView").length, 3);
  assert.equal(queue.filter((call) => call[2] === "ViewContent").length, 1);
  assert.deepEqual(Array.from(queue[0]), [
    "set",
    "autoConfig",
    false,
    "123456789012345",
  ]);
  assert.ok(
    queue.every((call) => call[0] !== "track" && call[0] !== "trackCustom"),
  );
});

test("events scope a first message to each room, persist deduplication and omit raw guest/room data", () => {
  const h = pixelHarness({ configured: true });
  const roomA = crypto.randomUUID() + "_master-a",
    roomB = crypto.randomUUID() + "_master-b";
  h.window.location.pathname = "/chat/" + roomA;
  h.pixel.trackStartConsultation("master-a", "Guía A", roomA);
  h.pixel.trackFirstMessageSent(roomA, "master-a");
  h.pixel.trackFirstMessageSent(roomA, "master-a");
  h.pixel.trackFirstMessageSent(roomB, "master-b");
  let first = h.window.fbq.queue.filter(
    (call) => call[2] === "FirstMessageSent",
  );
  assert.equal(first.length, 2);
  assert.notEqual(first[0][3].conversation_ref, first[1][3].conversation_ref);
  assert.equal(first[0][3].demo_mode, false);
  assert.equal(JSON.stringify(h.window.fbq.queue).includes(roomA), false);
  assert.equal(JSON.stringify(h.window.fbq.queue).includes(roomB), false);
  const reloaded = evaluate("src/lib/metaPixel.ts", h.globals);
  reloaded.trackFirstMessageSent(roomA, "master-a");
  first = h.window.fbq.queue.filter((call) => call[2] === "FirstMessageSent");
  assert.equal(first.length, 2);
});

test("ad blockers, throwing SDKs and denied storage do not interrupt navigation or messages", () => {
  const h = pixelHarness({ storageBlocked: true });
  assert.doesNotThrow(() => {
    h.pixel.trackFirstMessageSent("room-a", "demo-a");
    h.pixel.trackFirstMessageSent("room-a", "demo-a");
  });
  assert.equal(
    h.window.fbq.queue.filter((call) => call[2] === "FirstMessageSent").length,
    1,
  );
  assert.equal(h.window.fbq.queue.at(-1)[3].demo_mode, true);
  h.pixel.disableMetaPixel();
  h.pixel.trackPageView();
  assert.equal(h.window.fbq.queue.length, 0);
  const throwing = pixelHarness();
  throwing.window.fbq = () => {
    throw new Error("blocked");
  };
  assert.doesNotThrow(() => throwing.pixel.trackPageView());
  assert.doesNotThrow(() =>
    throwing.pixel.trackStartConsultation("a", "A", "room"),
  );
});

test("staff routes produce no funnel events and a permanently blocked SDK has a bounded queue", () => {
  const h = pixelHarness();
  for (const path of ["/admin", "/maestro/login", "/maestro/panel"]) {
    h.window.location.pathname = path;
    h.pixel.trackPageView();
    h.pixel.trackViewMaster("a", "A", "Tarot");
  }
  assert.equal(h.window.fbq, undefined);
  h.window.location.pathname = "/catalogo";
  for (let i = 0; i < 150; i++)
    h.pixel.trackStartConsultation("a", "A", "room-a");
  assert.equal(h.window.fbq.queue.length, 100);
});
