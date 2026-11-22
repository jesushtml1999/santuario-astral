import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { createElement, useState } from "react";
import { evaluate } from "./chat-harness.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const { render, fireEvent, waitFor, act, cleanup } =
  await import("@testing-library/react");
const require = createRequire(import.meta.url);
after(() => {
  cleanup();
  dom.window.close();
});
afterEach(() => cleanup());

function editor() {
  const changes = [],
    errors = [],
    states = [],
    saved = [],
    revoked = [];
  let complete,
    reject,
    options,
    uploads = 0;
  URL.createObjectURL = () => "blob:local-preview";
  URL.revokeObjectURL = (value) => revoked.push(value);
  dom.window.Image = class {
    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  };
  const Profile = evaluate("src/components/ProfileFields.tsx", {
    window: dom.window,
    AbortController,
    require: (name) => {
      if (name === "next/image")
        return {
          __esModule: true,
        default: (props) => {
          const attributes = { ...props };
          delete attributes.unoptimized;
          return createElement("img", attributes);
        },
        };
      if (name === "@/lib/masterValidation")
        return {
          MASTER_SPECIALTIES: ["Tarot"],
          safeAvatarUrl: (value) => (value.startsWith("https:") ? value : ""),
        };
      if (name === "@/lib/firebaseEnvironment")
        return { isFirebaseConfigured: () => true };
      if (name === "@/components/CountrySelect")
        return { __esModule: true, default: () => null };
      if (name === "@/lib/masterAvatar")
        return {
          validateAvatarFile: async (file) => {
            if (file.type !== "image/png")
              throw new Error("Formato no admitido");
          },
          uploadMasterAvatar: (_file, _master, settings) => {
            uploads++;
            options = settings;
            return new Promise((resolve, fail) => {
              complete = resolve;
              reject = fail;
            });
          },
          avatarErrorMessage: (error) => error.message,
        };
      return require(name);
    },
  }).default;
  function Form() {
    const [value, setValue] = useState({
      countryCode: "",
      avatarUrl: "https://example.test/broken.png",
      bio: "Biografía",
      specialties: ["Tarot"],
    });
    const [busy, setBusy] = useState(false);
    return createElement(
      "div",
      null,
      createElement(Profile, {
        value,
        onChange: (next) => {
          changes.push(next);
          setValue(next);
        },
        onError: (error) => errors.push(error),
        masterId: "master-a",
        onUploadingChange: (active) => {
          states.push(active);
          setBusy(active);
        },
      }),
      createElement(
        "button",
        { disabled: busy, onClick: () => saved.push(value.avatarUrl) },
        "Guardar prueba",
      ),
    );
  }
  const view = render(createElement(Form));
  const choose = () =>
    fireEvent.change(view.getByLabelText("Cargar foto del maestro"), {
      target: {
        files: [
          new dom.window.File(["PNG fixture"], "foto.png", {
            type: "image/png",
          }),
        ],
      },
    });
  return {
    view,
    choose,
    changes,
    errors,
    states,
    saved,
    revoked,
    get uploads() {
      return uploads;
    },
    get options() {
      return options;
    },
    complete: (url) => complete(url),
    reject: (error) => reject(error),
  };
}

test("broken preview becomes a camera placeholder; upload preview/progress precede save of the HTTPS URL", async () => {
  const h = editor();
  fireEvent.error(h.view.getByAltText("Vista previa de la foto del maestro"));
  assert.equal(
    h.view.queryByAltText("Vista previa de la foto del maestro"),
    null,
  );
  await act(async () => h.choose());
  await waitFor(() => assert.equal(h.uploads, 1));
  assert.equal(
    h.view
      .getByAltText("Vista previa de la foto del maestro")
      .getAttribute("src"),
    "blob:local-preview",
  );
  assert.equal(h.changes.length, 0);
  assert.equal(h.view.getByText("Guardar prueba").disabled, true);
  fireEvent.click(h.view.getByText("Guardar prueba"));
  assert.equal(h.saved.length, 0);
  await act(async () => h.options.onProgress(45));
  assert.equal(h.view.getByRole("progressbar").getAttribute("value"), "45");
  const url = "https://firebasestorage.googleapis.com/v0/b/test/o/avatar.png";
  await act(async () => h.complete(url));
  assert.equal(h.changes[0].avatarUrl, url);
  assert.deepEqual(h.states, [true, false]);
  fireEvent.click(h.view.getByText("Guardar prueba"));
  assert.deepEqual(h.saved, [url]);
  h.view.unmount();
  assert.ok(h.revoked.includes("blob:local-preview"));
});

test("failed upload retains the previous profile URL and can be retried; unmount aborts and never applies a late upload", async () => {
  const h = editor();
  await act(async () => h.choose());
  await waitFor(() => assert.equal(h.uploads, 1));
  await act(async () => h.reject(new Error("No pudimos subir la foto")));
  assert.equal(h.changes.length, 0);
  assert.ok(h.errors.includes("No pudimos subir la foto"));
  assert.equal(h.view.getByText("Guardar prueba").disabled, false);
  await act(async () => h.choose());
  await waitFor(() => assert.equal(h.uploads, 2));
  const signal = h.options.signal;
  h.view.unmount();
  assert.equal(signal.aborted, true);
  await act(async () => h.complete("https://example.test/too-late.png"));
  assert.equal(h.changes.length, 0);
});
