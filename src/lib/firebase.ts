"use client";

import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function requireEnvironmentVariable(
  name: string,
  value: string | undefined,
): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(
      `Falta configurar ${name} en .env.local para utilizar Firebase.`,
    );
  }

  return normalizedValue;
}

export function getFirebaseConfig(): FirebaseOptions {
  // Keep explicit property access so Next.js can inline public variables.
  return {
    apiKey: requireEnvironmentVariable(
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    ),
    authDomain: requireEnvironmentVariable(
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    ),
    projectId: requireEnvironmentVariable(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    ),
    storageBucket: requireEnvironmentVariable(
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    ),
    messagingSenderId: requireEnvironmentVariable(
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    ),
    appId: requireEnvironmentVariable(
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    ),
  };
}

// Reuse the default app during hot reloads, even if named apps also exist.
const app =
  getApps().find((existingApp) => existingApp.name === "[DEFAULT]") ??
  initializeApp(getFirebaseConfig());

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
// Storage stays uninitialized until its plan and upload adapter are explicitly enabled.
