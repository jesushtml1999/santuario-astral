import assert from "node:assert/strict";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { mockMasters } from "../src/lib/mockMasters.ts";

const project = process.argv.find((arg) => arg.startsWith("--project="))?.slice(10);
assert.ok(project, "Indica explícitamente --project=ID para publicar.");
assert.equal(project, process.env.FIREBASE_ADMIN_PROJECT_ID, "Proyecto y credenciales deben coincidir.");
assert.equal(mockMasters.length, 20, "La carga debe corresponder a los 20 perfiles iniciales.");
const { FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail, FIREBASE_ADMIN_PRIVATE_KEY: privateKey } = process.env;
assert.ok(clientEmail && privateKey, "Faltan las credenciales privadas del servidor.");
const app = initializeApp({
  projectId: project,
  credential: cert({ projectId: project, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }),
}, "publish-initial-masters");
const db = getFirestore(app);
try {
  const selected = mockMasters.map((source) => {
    const uid = source.id.replace(/^demo-/, "initial-");
    return { source, uid, profile: db.doc(`masters/${uid}`), role: db.doc(`users/${uid}`) };
  });
  const published = await db.runTransaction(async (transaction) => {
    const records = await transaction.getAll(...selected.map((item) => item.profile), ...selected.map((item) => item.role));
    let changed = 0;
    for (const [index, item] of selected.entries()) {
      const profile = records[index], role = records[index + selected.length];
      assert.ok(profile.exists && profile.data().id === item.uid, `Falta el perfil inicial ${item.uid}.`);
      assert.ok(role.exists && role.data().initialSeedId === item.source.id && role.data().role === "maestro" && role.data().masterId === item.uid,
        `No se pudo verificar la identidad de ${item.uid}; no se publica otro perfil.`);
      if (profile.data().isActive !== true) {
        transaction.update(item.profile, { isActive: true });
        changed++;
      }
    }
    transaction.set(db.doc("publicConfig/catalog"), {
      hasMasters: true, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return changed;
  });
  console.log(JSON.stringify({ project, selected: selected.length, published, alreadyVisible: selected.length - published }));
} finally {
  await db.terminate();
  await deleteApp(app);
}
