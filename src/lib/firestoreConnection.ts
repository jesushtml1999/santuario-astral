import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";

export type FirestoreConnectionResult =
  | { status: "not-configured" }
  | { status: "connected"; hasMasters: boolean }
  | { status: "unavailable"; reason: "permissions" | "connection" };

/** Public, read-only query compatible with the active-catalog security rules. */
export async function checkFirestoreConnection(
  timeoutMs = 8000,
): Promise<FirestoreConnectionResult> {
  if (!isFirebaseConfigured()) return { status: "not-configured" };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async (): Promise<FirestoreConnectionResult> => {
      const [{ db }, { collection, query, where, limit, getDocsFromServer }] =
        await Promise.all([
          import("@/lib/firebase"),
          import("firebase/firestore"),
        ]);
      const snapshot = await getDocsFromServer(
        query(
          collection(db, "masters"),
          where("isActive", "==", true),
          limit(1),
        ),
      );
      return { status: "connected", hasMasters: !snapshot.empty };
    };
    return await Promise.race([
      read(),
      new Promise<FirestoreConnectionResult>((resolve) => {
        timeout = setTimeout(
          () => resolve({ status: "unavailable", reason: "connection" }),
          timeoutMs,
        );
      }),
    ]);
  } catch (cause) {
    const code =
      typeof cause === "object" && cause !== null && "code" in cause
        ? cause.code
        : "";
    return {
      status: "unavailable",
      reason: code === "permission-denied" ? "permissions" : "connection",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
