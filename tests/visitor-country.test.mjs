import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { countryHelpers, evaluate } from "./chat-harness.mjs";

const require = createRequire(import.meta.url);
const visitor = evaluate("src/lib/visitorCountry.ts", {
  require: name => name === "@/lib/countries" ? countryHelpers : require(name),
});
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://santuario.test/catalogo",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { hydrateRoot } = await import("react-dom/client");
const { act, render, fireEvent, cleanup } = await import("@testing-library/react");
after(() => { cleanup(); dom.window.close(); });

const Image = props => {
  const attributes = { ...props };
  delete attributes.unoptimized;
  return createElement("img", attributes);
};
const Link = ({ children, ...props }) => createElement("a", props, children);
const flag = evaluate("src/components/CountryFlag.tsx", {
  require: name => name === "next/image" ? { default: Image, __esModule: true }
    : name === "@/lib/countries" ? countryHelpers : require(name),
}).default;
const Card = evaluate("src/components/MasterCard.tsx", {
  require: name => name === "next/link" ? { default: Link, __esModule: true }
    : name === "@/lib/visitorCountry" ? visitor
    : name === "@/components/CountryFlag" ? { default: flag, __esModule: true }
    : name === "@/lib/masters" ? { safeAvatarUrl: () => "" }
    : require(name),
}).default;
const masters = [
  { id: "a", name: "Guía A", specialty: "Tarot", bio: "Lectura", countryCode: "PA" },
  { id: "b", name: "Guía B", specialty: "Amor", bio: "Consulta", countryCode: "MX" },
].map(master => ({ ...master, isActive: true, isOnline: true, rating: 4.9,
  reviewsCount: 10, experienceYears: 5 }));

test("visitor flags support NI, CO, MX and other ISO countries; malformed or missing headers use NI", () => {
  for (const code of ["NI", "CO", "MX", "US", "ES", "JP"]) {
    const result = visitor.resolveVisitorCountry(` ${code.toLowerCase()} `);
    assert.equal(result.countryCode, code);
    assert.equal(result.detected, true);
    assert.ok(fs.existsSync(`public/flags/${result.countryCode}.svg`));
  }
  for (const value of [null, undefined, "", "ZZ", "COL", "CO,MX", "../NI", "<script>"]) {
    const result = visitor.resolveVisitorCountry(value);
    assert.equal(result.countryCode, "NI");
    assert.equal(result.detected, false);
    assert.match(visitor.visitorCountryLabel(result), /País de referencia: Nicaragua/);
  }
});

test("server catalog resolves every request independently and serializes the country into client props", async () => {
  let code = null;
  const Component = evaluate("src/components/VisitorCatalog.tsx", {
    require: name => name === "next/headers" ? {
      headers: async () => new Headers(code ? { "x-vercel-ip-country": code } : {}),
    } : name === "@/lib/visitorCountry" ? visitor
      : name === "@/components/CatalogExperience" ? { default: () => null, __esModule: true }
      : require(name),
  }).default;
  const pending = [];
  for (const country of ["NI", "CO", "MX", "US", null, "CO"]) {
    code = country;
    pending.push(Component());
  }
  const results = await Promise.all(pending);
  assert.deepEqual(results.map(result => result.props.visitorCountry.countryCode),
    ["NI", "CO", "MX", "US", "NI", "CO"]);
  assert.equal(results[4].props.visitorCountry.detected, false);
});

test("catalog card hydrates with the same visitor SVG and preserves the master's country and navigation", async () => {
  for (const code of ["NI", "CO", "MX", "US", null]) {
    const master = { ...masters[0] };
    const country = visitor.resolveVisitorCountry(code);
    const element = createElement(Card, { master, visitorCountry: country,
      isDemo: false, isFavorite: false, onToggleFavorite: () => {} });
    const host = document.createElement("div");
    host.innerHTML = renderToString(element);
    document.body.append(host);
    const before = host.querySelector(".country-badge").outerHTML;
    const errors = [];
    let root;
    await act(async () => {
      root = hydrateRoot(host, element, { onRecoverableError: error => errors.push(error) });
    });
    assert.equal(host.querySelector(".country-badge").outerHTML, before);
    assert.equal(host.querySelector(".country-badge img").getAttribute("src"),
      `/flags/${country.countryCode}.svg`);
    assert.equal(host.querySelector(".country-badge img").getAttribute("width"), "24");
    assert.equal(host.querySelector(".country-badge img").getAttribute("height"), "16");
    assert.match(host.querySelector(".country-badge").title,
      country.detected ? /Tu ubicación aproximada/ : /País de referencia/);
    assert.equal(host.querySelector(".master-link").getAttribute("href"), "/maestro/a");
    assert.equal(master.countryCode, "PA");
    assert.deepEqual(errors, []);
    await act(async () => root.unmount());
    host.remove();
  }
});

test("specialty filters, favorites and profile links retain the visitor flag", () => {
  let query = "";
  const Empty = () => null;
  const Catalog = evaluate("src/components/CatalogExperience.tsx", {
    require: name => name === "@/hooks/useMasters" ? {
      useMasters: () => ({ masters, isDemo: false, isLoading: false }),
    } : name === "@/hooks/useFavorites" ? {
      useFavorites: () => ({ favorites: ["b"], toggleFavorite: () => {} }),
    } : name === "next/navigation" ? { useSearchParams: () => new URLSearchParams(query) }
      : name === "next/link" ? { default: Link, __esModule: true }
      : name === "@/components/MasterCard" ? { default: Card, __esModule: true }
      : name.startsWith("@/components/") ? { default: Empty, __esModule: true }
      : require(name),
  }).default;
  const element = createElement(Catalog, { visitorCountry: visitor.resolveVisitorCountry("CO") });
  const view = render(element);
  assert.equal(view.container.querySelectorAll(".master-card").length, 2);
  fireEvent.click(view.getByRole("button", { name: "Amor", exact: true }));
  assert.equal(view.container.querySelectorAll(".master-card").length, 1);
  assert.equal(view.container.querySelector(".master-link").getAttribute("href"), "/maestro/b");
  assert.equal(view.container.querySelector(".country-badge img").getAttribute("src"), "/flags/CO.svg");
  fireEvent.click(view.getByRole("button", { name: "Todos", exact: true }));
  query = "vista=favoritos";
  view.rerender(createElement(Catalog, { visitorCountry: visitor.resolveVisitorCountry("CO") }));
  assert.equal(view.container.querySelectorAll(".master-card").length, 1);
  assert.ok(view.getByRole("heading", { name: "Tus guías favoritos" }));
  assert.equal(view.container.querySelector(".master-link").getAttribute("href"), "/maestro/b");
  view.unmount();
});
