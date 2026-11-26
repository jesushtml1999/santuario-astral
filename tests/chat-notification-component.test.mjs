import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { evaluate, flush } from "./chat-harness.mjs";

const dom = new JSDOM("<!doctype html><html><head><title>Santuario Astral</title></head><body></body></html>", {
  url: "https://santuario.test/catalogo",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, act, fireEvent } = await import("@testing-library/react");
const require = createRequire(import.meta.url);
after(() => { cleanup(); dom.window.close(); });

test("global alerts persist across navigation, unlock explicitly, update a hidden tab title and clear on session changes", async () => {
  let visibility = "visible", pathname = "/catalogo", session = null;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  const store = evaluate("src/lib/chatNotifications.ts", { window: dom.window, navigator: {} });
  const hook = evaluate("src/hooks/useChatNotifications.ts", { require: name =>
    name === "@/lib/chatNotifications" ? store : require(name) });
  const sources = [], played = [], enabled = [];
  let muted = 0, disposed = 0;
  const Link = ({ children, ...props }) => createElement("a", props, children);
  const Component = evaluate("src/components/ChatNotifications.tsx", {
    window: dom.window, document, HTMLElement: dom.window.HTMLElement,
    require: name => name === "next/link" ? { __esModule: true, default: Link }
      : name === "next/navigation" ? { usePathname: () => pathname }
      : name === "@/hooks/useStaffSession" ? { useStaffSession: () => ({ session, loading: false, error: "" }) }
      : name === "@/hooks/useChatNotifications" ? hook
      : name === "@/lib/chatNotifications" ? store
      : name === "@/lib/chatInbox" ? { subscribeChatInbox: (actor, next, error) => {
        const source = { actor, next, error, stopped: false };
        sources.push(source);
        return () => { source.stopped = true; };
      } }
      : name === "@/lib/notificationSound" ? { createNotificationSound: changed => {
        changed("locked");
        return { enable: async automatic => { enabled.push(Boolean(automatic)); changed("enabled"); return true; },
          mute: () => { muted++; changed("muted"); }, play: role => { played.push(role); }, dispose: () => disposed++ };
      } }
      : require(name),
  }).default;
  const Nav = evaluate("src/components/BottomNav.tsx", { require: name =>
    name === "next/link" ? { __esModule: true, default: Link }
      : name === "next/navigation" ? { usePathname: () => pathname, useSearchParams: () => new URLSearchParams() }
      : name === "@/hooks/useChatNotifications" ? hook
      : name === "@/lib/chatNotifications" ? store : require(name),
  }).default;
  const app = () => createElement("div", null, createElement(Component), createElement(Nav));
  const view = render(app());
  const base = { id: "guest_master", guestId: "guest", masterId: "master", masterName: "Guía", clientName: "Cliente",
    unreadByMaster: 0, unreadByClient: 1, lastMessageId: "history" };
  const emit = async (room, senderRole = "maestro") => {
    await act(async () => {
      sources.at(-1).next({ owner: session ? "master-owner" : "client-owner", role: session ? "maestro" : "cliente", confirmed: true,
        rooms: [room], readMessage: async value => ({ id: value.lastMessageId, senderRole,
          senderId: senderRole === "maestro" ? value.masterId : value.guestId }) });
      await flush();
    });
  };
  await emit(base);
  assert.equal(view.queryByRole("status"), null, "history has only an unread badge");
  assert.equal(played.length, 0);
  assert.ok(view.getByLabelText("1 mensajes sin leer"));
  const button = view.getByRole("button", { name: "Activar sonido de mensajes" });
  fireEvent.pointerDown(button);
  fireEvent.click(button);
  assert.deepEqual(enabled, [false], "the activation button must not immediately mute itself");
  assert.equal(muted, 0);
  visibility = "hidden";
  act(() => document.dispatchEvent(new dom.window.Event("visibilitychange")));
  await emit({ ...base, lastMessageId: "reply", unreadByClient: 2 });
  assert.match(view.getByRole("status").textContent, /Nuevo mensaje de Guía/);
  assert.match(document.title, /^\(2\) Mensajes sin leer/);
  assert.deepEqual(played, ["cliente"]);
  assert.equal(view.getByRole("link", { name: "Abrir chat" }).getAttribute("href"), "/chat/guest_master");
  pathname = "/chat/guest_master";
  view.rerender(app());
  assert.equal(sources.length, 1, "SPA navigation must not resubscribe or replay the inbox");
  await emit({ ...base, lastMessageId: "reply", unreadByClient: 0 });
  assert.equal(played.length, 1);
  visibility = "visible";
  act(() => document.dispatchEvent(new dom.window.Event("visibilitychange")));
  assert.equal(document.title, "Santuario Astral");
  fireEvent.click(view.getByRole("button", { name: "Cerrar aviso" }));
  assert.equal(view.queryByRole("status"), null);
  session = { uid: "master", masterId: "master", role: "maestro", mode: "firebase" };
  view.rerender(app());
  assert.equal(sources[0].stopped, true);
  await emit({ ...base, unreadByMaster: 3 }, "cliente");
  assert.equal(played.length, 1, "a new actor's initial history stays silent");
  assert.ok(view.getByRole("link", { name: "Mensajes: 3 sin leer" }));
  await emit({ ...base, lastMessageId: "new-intake", unreadByMaster: 4 }, "cliente");
  assert.equal(played.at(-1), "maestro");
  fireEvent.click(view.getByRole("button", { name: "Silenciar avisos de chat" }));
  await emit({ ...base, lastMessageId: "silent", unreadByMaster: 5 }, "cliente");
  assert.equal(played.length, 2);
  assert.match(view.getByRole("status").textContent, /Nuevo mensaje de Cliente/);
  session = { uid: "admin", role: "admin", mode: "firebase" };
  view.rerender(app());
  assert.equal(sources.at(-1).stopped, true);
  assert.equal(view.queryByLabelText("Avisos de chat"), null);
  assert.equal(store.getNotifications().rooms.length, 0);
  view.unmount();
  assert.equal(disposed, 1);
});
