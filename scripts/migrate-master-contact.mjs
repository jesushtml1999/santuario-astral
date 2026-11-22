import fs from "node:fs";
import assert from "node:assert/strict";
import countries from "i18n-iso-countries";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

process.loadEnvFile(".env.local");
const project = process.argv
  .find((arg) => arg.startsWith("--project="))
  ?.slice(10);
assert.equal(
  project,
  "santuario-astral-v2",
  "Specify the v2 project explicitly.",
);
assert.equal(process.env.FIREBASE_ADMIN_PROJECT_ID, project);
const app = initializeApp(
  {
    projectId: project,
    credential: cert({
      projectId: project,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  },
  "master-contact-migration",
);
const db = getFirestore(app),
  apply = process.argv.includes("--apply");
try {
  const profiles = await db.collection("masters").get();
  const users = profiles.empty
    ? []
    : await db.getAll(
        ...profiles.docs.map((profile) => db.doc(`users/${profile.id}`)),
      );
  const plan = [],
    backup = [];
  for (let index = 0; index < profiles.docs.length; index++) {
    const profile = profiles.docs[index],
      user = users[index];
    assert.ok(
      user.exists &&
        user.data().role === "maestro" &&
        user.data().masterId === profile.id,
      "Review missing or mismatched private role before migrating.",
    );
    const data = profile.data(),
      privateData = user.data();
    const countryCode =
      data.countryCode == null
        ? ""
        : String(data.countryCode).trim().toUpperCase();
    assert.ok(
      countryCode === "" ||
        Object.hasOwn(countries.getAlpha2Codes(), countryCode),
      "Review an invalid country before migrating.",
    );
    const privatePhone = privateData.phone == null ? "" : privateData.phone;
    const publicPhone = data.phone == null ? "" : data.phone;
    assert.ok(
      typeof privatePhone === "string" && typeof publicPhone === "string",
      "Review non-text contact data before migrating.",
    );
    assert.ok(
      !privatePhone ||
        !publicPhone ||
        privatePhone.trim() === publicPhone.trim(),
      "Public/private phone conflict: review before migrating.",
    );
    const phone = (privatePhone || publicPhone).trim();
    assert.ok(
      !phone || /^\+[1-9]\d{6,14}$/.test(phone),
      "Review an invalid international phone before migrating.",
    );
    backup.push({
      id: profile.id,
      publicProfile: data,
      privateProfile: privateData,
    });
    const publicUpdate = {},
      privateUpdate = {};
    if (data.countryCode !== countryCode)
      publicUpdate.countryCode = countryCode;
    if (Object.hasOwn(data, "phone")) publicUpdate.phone = FieldValue.delete();
    if (privateData.phone !== phone) privateUpdate.phone = phone;
    if (Object.keys(publicUpdate).length || Object.keys(privateUpdate).length)
      plan.push({ profile, user, publicUpdate, privateUpdate });
  }
  const report = {
    project,
    apply,
    profiles: profiles.size,
    updates: plan.length,
    unassignedCountries: backup.filter(
      (item) => !item.publicProfile.countryCode,
    ).length,
    phoneLocation: "users/{masterId}.phone (private)",
    countryLocation: "masters/{masterId}.countryCode (public)",
  };
  if (apply && plan.length) {
    const file = `.env.master-contact-before-${Date.now()}.json`;
    fs.writeFileSync(file, JSON.stringify(backup, null, 2), { flag: "wx" });
    for (let index = 0; index < plan.length; index += 200) {
      const batch = db.batch();
      for (const item of plan.slice(index, index + 200)) {
        if (Object.keys(item.publicUpdate).length)
          batch.update(item.profile.ref, item.publicUpdate, {
            lastUpdateTime: item.profile.updateTime,
          });
        if (Object.keys(item.privateUpdate).length)
          batch.update(item.user.ref, item.privateUpdate, {
            lastUpdateTime: item.user.updateTime,
          });
      }
      await batch.commit();
    }
    fs.mkdirSync(".firebase", { recursive: true });
    fs.writeFileSync(
      ".firebase/master-contact-migration.json",
      JSON.stringify(
        { ...report, appliedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
  }
  console.log(JSON.stringify(report));
} finally {
  await db.terminate();
  await deleteApp(app);
}
