import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { evaluate } from "./chat-harness.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://santuario.test/catalogo" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, fireEvent } = await import("@testing-library/react");
const require = createRequire(import.meta.url);
after(() => { cleanup(); dom.window.close(); });

test("both reveal controls track a successful reveal, and a restored daily card adds no new event", () => {
  let selection = null, tracked = 0;
  const listeners = new Set();
  const daily = {
    dailyCards: [{ id: "sol", name: "El Sol", message: "Lectura de prueba" }],
    getDailyCardSnapshot: () => selection,
    revealDailyCard: () => {
      selection = "2026-11-24|sol";
      for (const listener of listeners) listener();
    },
    subscribeDailyCard: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const Component = evaluate("src/components/DailyCardBanner.tsx", { require: name => {
    if (name === "@/lib/dailyCard") return daily;
    if (name === "@/lib/metaPixel") return { trackRevealDailyCard: () => tracked++ };
    if (name.endsWith(".css")) return {};
    return require(name);
  } }).default;
  for (const control of ["Revelar mi carta", "Revelar mi carta del día"]) {
    selection = null;
    const before = tracked;
    const view = render(createElement(Component));
    fireEvent.click(view.getByRole("button", { name: control, exact: true }));
    assert.equal(tracked, before + 1);
    assert.ok(view.getByRole("heading", { name: "El Sol" }));
    assert.ok(view.getByRole("link", { name: "Ver maestros" }));
    view.unmount();
    const restored = render(createElement(Component));
    assert.ok(restored.getByRole("heading", { name: "El Sol" }));
    assert.equal(tracked, before + 1);
    restored.unmount();
  }
  assert.equal(listeners.size, 0);
});
