import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, StrictMode } from "react";
import { JSDOM } from "jsdom";
import { evaluate } from "./chat-harness.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://santuario.test/catalogo" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, act } = await import("@testing-library/react");
const require = createRequire(import.meta.url);
after(() => { cleanup(); dom.window.close(); });

test("the root tracker initializes before loading the SDK and sends one PageView per SPA visit", () => {
  const pixel = evaluate("src/lib/metaPixel.ts", {
    window: dom.window,
    process: { env: { NEXT_PUBLIC_META_PIXEL_ID: "123456789012345" } },
    require: () => ({ isFirebaseConfigured: () => true }),
  });
  let pathname = "/catalogo", query = "", script;
  function Script(props) {
    assert.ok(dom.window.fbq, "fbq must exist before the external SDK renders");
    assert.equal(dom.window.fbq.disablePushState, true);
    script = props;
    return createElement("span", { "data-src": props.src, id: props.id });
  }
  const Component = evaluate("src/components/MetaPixel.tsx", { require: name => {
    if (name === "next/script") return { __esModule: true, default: Script };
    if (name === "next/navigation") return { usePathname: () => pathname,
      useSearchParams: () => new URLSearchParams(query) };
    if (name === "@/lib/metaPixel") return pixel;
    return require(name);
  } }).default;
  const app = () => createElement(StrictMode, null, createElement(Component));
  const view = render(app());
  const count = () => dom.window.fbq.queue.filter(c => c[2] === "PageView").length;
  assert.equal(count(), 1);
  act(() => { script.onReady(); script.onReady(); });
  assert.equal(count(), 1);
  assert.equal(document.querySelectorAll("#santuario-meta-pixel").length, 1);
  pathname = "/maestro/master-a";
  dom.reconfigure({ url: `https://santuario.test${pathname}` });
  view.rerender(app());
  assert.equal(count(), 2);
  query = "from=catalogo";
  dom.reconfigure({ url: `https://santuario.test${pathname}?${query}` });
  view.rerender(app());
  assert.equal(count(), 3);
  pathname = "/admin";
  dom.reconfigure({ url: "https://santuario.test/admin" });
  view.rerender(app());
  assert.equal(count(), 3);
  assert.equal(document.querySelectorAll("#santuario-meta-pixel").length, 0);
  pathname = "/catalogo"; query = "";
  dom.reconfigure({ url: "https://santuario.test/catalogo" });
  view.rerender(app());
  assert.equal(count(), 4);
  act(() => script.onError());
  assert.equal(count(), 0);
  assert.doesNotThrow(() => pixel.trackRevealDailyCard());
  assert.equal(count(), 0);
  view.unmount();
});
