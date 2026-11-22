import assert from "node:assert/strict";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { mockMasters } from "../src/lib/mockMasters.ts";

const project = process.argv.find((arg) => arg.startsWith("--project="))?.slice(10);
assert.ok(project, "Indica explícitamente --project=ID antes de cargar los borradores.");
assert.equal(project, process.env.FIREBASE_ADMIN_PROJECT_ID, "El proyecto debe coincidir con las credenciales.");
const { FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail, FIREBASE_ADMIN_PRIVATE_KEY: privateKey } = process.env;
assert.ok(clientEmail && privateKey, "Faltan las credenciales privadas del servidor.");
const app = initializeApp({ projectId: project, credential: cert({ projectId: project, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }) }, "seed-initial-masters");
const auth = getAuth(app), db = getFirestore(app);
let created = 0, skipped = 0;
try {
  for (const source of mockMasters) {
    const uid = source.id.replace(/^demo-/, "initial-");
    const profileRef = db.doc(`masters/${uid}`), userRef = db.doc(`users/${uid}`);
    const [profile, role] = await db.getAll(profileRef, userRef);
    if (profile.exists || role.exists) {
      assert.ok(profile.exists && role.data()?.initialSeedId === source.id && role.data()?.masterId === uid,
        `El ID ${uid} está ocupado por otro perfil; no se sobrescribe.`);
      skipped++;
      continue;
    }
    let accountCreated = false;
    try {
      try {
        const existing = await auth.getUser(uid);
        assert.ok(existing.disabled && !existing.email && existing.providerData.length === 0,
          `El acceso ${uid} ya está configurado; no se modifica.`);
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
        await auth.createUser({ uid, displayName: source.name, disabled: true });
        accountCreated = true;
      }
      const batch = db.batch();
      batch.create(profileRef, {
        ...source, id: uid, specialties: source.specialties ?? [source.specialty],
        avatarUrl: "", experienceYears: 0, rating: 0, reviewsCount: 0,
        isOnline: false, isActive: false, isTestProfile: true,
      });
      batch.create(userRef, {
        role: "maestro", masterId: uid, displayName: source.name, email: "",
        disabled: true, accessPending: true, initialSeedId: source.id,
      });
      batch.set(db.doc("publicConfig/catalog"), {
        hasMasters: true, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      created++;
    } catch (error) {
      // Never delete an account after an uncertain successful commit.
      if (accountCreated && !(await profileRef.get()).exists) await auth.deleteUser(uid);
      throw error;
    }
  }
  console.log(JSON.stringify({ project, created, skipped, totalInitialProfiles: mockMasters.length }));
} finally {
  await db.terminate();
  await deleteApp(app);
}
