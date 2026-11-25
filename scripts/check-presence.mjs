// Opt-in verification: one hidden temporary account, no public catalog entry or messages.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

assert.ok(process.argv.includes("--run"), "Run explicitly with --run.");
process.loadEnvFile(".env.local");
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
assert.equal(projectId, "santuario-astral-v2");
assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, projectId);
const app = initializeApp({ projectId, credential: cert({ projectId,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
}) }, "presence-verification");
const db = getFirestore(app), auth = getAuth(app);
const uid = "presence-check-" + randomUUID();
const connections = [randomUUID(), randomUUID()];
let created = false;
try {
  await auth.createUser({ uid, displayName: "Verificación interna de presencia" });
  created = true;
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}`), { role: "maestro", masterId: uid, disabled: false });
  batch.set(db.doc(`masters/${uid}`), { id: uid, name: "Verificación interna de presencia", countryCode: "",
    specialty: "Tarot", bio: "Perfil temporal oculto de verificación.", avatarUrl: "", experienceYears: 0,
    rating: 0, reviewsCount: 0, isOnline: false, isActive: false, isTestProfile: true });
  await batch.commit();
  const customToken = await auth.createCustomToken(uid);
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  assert.equal(signIn.status, 200, "Firebase test sign-in failed.");
  const { idToken } = await signIn.json();
  assert.ok(idToken);
  const post = async (action, connectionId) => {
    const response = await fetch("https://santuario-astral.vercel.app/api/staff/presence", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}`,
        Origin: "https://santuario-astral.vercel.app" },
      body: JSON.stringify({ action, connectionId }),
    });
    assert.equal(response.status, 200, `Presence ${action} request failed (${response.status}).`);
    assert.equal((await response.json()).isOnline, false, "Hidden profiles must remain offline publicly.");
  };
  const count = async () => Object.values((await db.doc(`staffPresence/${uid}`).get()).data().connections)
    .filter(c => c.connected).length;
  await post("connect", connections[0]);
  await post("connect", connections[1]);
  assert.equal(await count(), 2);
  await post("heartbeat", connections[1]);
  await post("disconnect", connections[0]);
  assert.equal(await count(), 1);
  await post("disconnect", connections[1]);
  assert.equal(await count(), 0);
  assert.equal((await db.doc(`masters/${uid}`).get()).data().presenceExpiresAt.toMillis(), 0);
  console.log("Production presence API verified: authenticated, multi-session, disconnect and hidden-profile protection.");
} finally {
  if (created) {
    const cleanup = db.batch();
    for (const collection of ["users", "masters", "staffPresence"]) cleanup.delete(db.doc(`${collection}/${uid}`));
    await cleanup.commit();
    await auth.deleteUser(uid);
    console.log("Temporary verification account and documents removed.");
  }
  await db.terminate();
  await deleteApp(app);
}
