import type { User } from "firebase/auth";
import type { ChatRoom } from "@/types";
import { getStaffSession } from "@/lib/staffAuth";

export interface ChatActor {
  id: string;
  role: "cliente" | "maestro";
  authUid: string;
}

let anonymousSignIn: Promise<User> | null = null;

export async function ensureVisitorUser(): Promise<User> {
  const { auth } = await import("@/lib/firebase");
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  anonymousSignIn ??= import("firebase/auth")
    .then(({ signInAnonymously }) => signInAnonymously(auth))
    .then((result) => result.user);
  try {
    return await anonymousSignIn;
  } finally {
    anonymousSignIn = null;
  }
}

export async function getChatBackend() {
  const session = await getStaffSession();
  if (session?.mode === "firebase" && session.role === "maestro") {
    const { staffAuth, staffDb } = await import("@/lib/staffFirebase");
    return { auth: staffAuth, db: staffDb };
  }
  return import("@/lib/firebase");
}

/** Firebase persists the anonymous credential. No registration UI is necessary. */
export async function ensureChatUser(): Promise<User> {
  const { auth } = await getChatBackend();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  anonymousSignIn ??= import("firebase/auth")
    .then(({ signInAnonymously }) => signInAnonymously(auth))
    .then((result) => result.user);
  try {
    return await anonymousSignIn;
  } finally {
    anonymousSignIn = null;
  }
}

export async function resolveCloudActor(
  room: Pick<ChatRoom, "guestId" | "masterId" | "clientAuthUid">,
): Promise<ChatActor> {
  const user = await ensureChatUser();
  if (room.clientAuthUid === user.uid)
    return { id: room.guestId, role: "cliente", authUid: user.uid };
  const { db } = await getChatBackend();
  const { doc, getDoc } = await import("firebase/firestore");
  const profile = await getDoc(doc(db, "users", user.uid));
  const data: unknown = profile.data();
  if (
    typeof data === "object" &&
    data !== null &&
    "role" in data &&
    data.role === "maestro" &&
    (!("disabled" in data) || data.disabled !== true) &&
    user.uid === room.masterId &&
    "masterId" in data &&
    data.masterId === room.masterId
  ) {
    return { id: room.masterId, role: "maestro", authUid: user.uid };
  }
  throw new Error("No tienes acceso a esta conversación con tu sesión actual.");
}
