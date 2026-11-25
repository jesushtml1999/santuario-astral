import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createHarness,
  countryHelpers,
  evaluate,
  flush,
} from "./chat-harness.mjs";

test("country selector renders a local flag and Spanish name with an accessible native select", () => {
  const require = createRequire(import.meta.url);
  let flag;
  const load = name => name === "@/lib/countries" ? countryHelpers : name === "@/components/CountryFlag" ? flag : require(name);
  flag = evaluate("src/components/CountryFlag.tsx", { require: load });
  const selector = evaluate("src/components/CountrySelect.tsx", { require: load });
  const html = renderToStaticMarkup(createElement(selector.default, { value: "CO", onChange: () => {} }));
  assert.ok(html.includes('/flags/CO.svg'));
  assert.ok(html.includes("Colombia"));
  assert.match(html, /<select[ >]/);
  assert.match(html, /value="CO" selected=""/);
  assert.equal(renderToStaticMarkup(createElement(flag.default, { code: null })), "");
});

test("countries normalize supported ISO codes and every selector country has a local SVG", () => {
  for (const code of ["CO", "MX", "NI", "PA", "US"]) {
    assert.equal(countryHelpers.validateCountryCode(code.toLowerCase()), code);
    assert.ok(countryHelpers.countryName(code));
  }
  for (const value of [undefined, null, ""])
    assert.equal(countryHelpers.validateCountryCode(value), "");
  for (const value of ["ZZ", "COL", 57, "../CO"])
    assert.throws(() => countryHelpers.validateCountryCode(value));
  for (const country of countryHelpers.COUNTRIES)
    assert.ok(fs.existsSync(`public/flags/${country.code}.svg`));
});

test("private phone accepts canonical E.164 or empty values and rejects local numbers and unsafe formats", () => {
  for (const phone of [
    "+573001234567",
    "+525512345678",
    "+50588881234",
    "+50761234567",
    "+12025550123",
  ])
    assert.equal(countryHelpers.validatePhone(phone), phone);
  for (const value of [null, undefined, "", " "])
    assert.equal(countryHelpers.validatePhone(value), "");
  for (const value of [
    1234,
    "3001234567",
    "+0573001234567",
    "+57 3001234567",
    "+1234567890123456",
    "+123",
    "tel:+573001234567",
  ])
    assert.throws(() => countryHelpers.validatePhone(value));
});

test("old public profiles tolerate missing or null country without exposing private phone", () => {
  const h = createHarness();
  const validation = evaluate("src/lib/masterValidation.ts", {
    require: (name) => {
      if (name === "@/lib/countries") return countryHelpers;
      if (name === "@/lib/presence") return evaluate("src/lib/presence.ts", {});
      if (name === "@/lib/mediaUploads")
        return { assertHostedAvatar: () => {} };
      throw new Error(name);
    },
  });
  for (const countryCode of [undefined, null, "", "ZZ", "co"]) {
    const parsed = validation.parseMaster("legacy-master", {
      ...h.masters[0],
      countryCode,
      phone: "+573001234567",
    });
    assert.ok(parsed);
    assert.equal(parsed.countryCode, countryCode === "co" ? "CO" : "");
    assert.equal("phone" in parsed, false);
  }
});

test("local admin contact edits stay private and do not require any assigned country or phone", async () => {
  const h = createHarness();
  await h.staff.signInStaff(
    h.staff.DEMO_ADMIN_LOGIN,
    h.staff.DEMO_ADMIN_PASSWORD,
  );
  const entry = (await h.staffService.getMasterDirectory()).entries[0];
  const input = {
    ...entry.profile,
    specialties: ["Tarot"],
    login: entry.login,
    countryCode: "co",
    phone: "+573001234567",
    isTestProfile: true,
  };
  await h.staffService.saveManagedMaster(input, entry.profile.id);
  const saved = (await h.staffService.getMasterDirectory()).entries[0];
  assert.equal(saved.profile.countryCode, "CO");
  assert.equal(saved.phone, input.phone);
  assert.equal("phone" in saved.profile, false);
  assert.equal(
    h.localMasters.readLocalMasters().some((profile) => "phone" in profile),
    false,
  );
  await h.staffService.saveManagedMaster(
    { ...input, countryCode: "", phone: "" },
    entry.profile.id,
  );
  assert.equal(
    (await h.staffService.getMasterDirectory()).entries[0].phone,
    "",
  );
});

test("chat country follows public profile changes without copying country or contact into rooms", async () => {
  const h = createHarness(true),
    room = await h.createRoom();
  const received = [];
  const stop = h.service.subscribeToChat(
    room,
    (state) => received.push(state),
    assert.fail,
  );
  await flush();
  await flush();
  h.cloud.set("masters/master-0", {
    ...h.cloud.get("masters/master-0"),
    countryCode: "NI",
  });
  h.notify();
  await flush();
  await flush();
  assert.equal(received.at(-1).masterCountryCode, "NI");
  assert.equal("countryCode" in h.cloud.get(`chats/${room}`), false);
  assert.equal("phone" in received.at(-1).session.room, false);
  stop();
});
