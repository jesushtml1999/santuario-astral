"use client";
import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFirebaseConfig } from "@/lib/firebase";

// Staff authentication never replaces the visitor's anonymous Firebase credential.
const app =
  getApps().find((item) => item.name === "santuario-staff") ??
  initializeApp(getFirebaseConfig(), "santuario-staff");
export const staffAuth = getAuth(app);
export const staffDb = getFirestore(app);
