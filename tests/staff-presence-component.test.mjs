import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { evaluate } from "./chat-harness.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://santuario.test" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup } = await import("@testing-library/react");
const require = createRequire(import.meta.url);
after(() => { cleanup(); dom.window.close(); });

test("global presence starts on master sign-in, survives navigation refreshes and stops on sign-out", () => {
  let session = null;
  const started = [], stopped = [];
  const Component = evaluate("src/components/StaffPresence.tsx", { require: name => {
    if (name === "@/hooks/useStaffSession") return { useStaffSession: () => ({ session }) };
    if (name === "@/lib/staffPresence") return { startMasterPresence: value => {
      started.push(value);
      return () => stopped.push(value.uid);
    } };
    return require(name);
  } }).default;
  const view = render(createElement(Component));
  session = { uid: "admin", role: "admin", mode: "firebase" };
  view.rerender(createElement(Component));
  assert.equal(started.length, 0);
  session = { uid: "master", role: "maestro", mode: "firebase", masterId: "master", displayName: "Nombre" };
  view.rerender(createElement(Component));
  assert.equal(started.length, 1);
  session = { ...session, displayName: "Nombre actualizado" };
  view.rerender(createElement(Component));
  assert.equal(started.length, 1);
  assert.equal(stopped.length, 0);
  session = null;
  view.rerender(createElement(Component));
  assert.deepEqual(stopped, ["master"]);
  view.unmount();
});
