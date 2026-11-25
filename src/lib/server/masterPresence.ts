import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminServices, StaffApiError } from "@/lib/server/firebaseAdmin";
import { nextPresence, presenceCommand } from "@/lib/presence";

export async function updateMasterPresence(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new StaffApiError("Origen no permitido.", 403);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new StaffApiError("Inicia sesión como maestro.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > 2048)
    throw new StaffApiError("Solicitud demasiado grande.", 413);
  const body = await request.text();
  if (body.length > 2048) throw new StaffApiError("Solicitud demasiado grande.", 413);
  let input: unknown;
  try { input = JSON.parse(body); } catch { throw new StaffApiError("Solicitud no válida.", 400); }
  const command = presenceCommand(input);
  const services = getAdminServices();
  let uid: string;
  try { uid = (await services.auth.verifyIdToken(token, true)).uid; }
  catch { throw new StaffApiError("Tu sesión no es válida.", 401); }
  const userRef = services.db.doc(`users/${uid}`);
  const profileRef = services.db.doc(`masters/${uid}`);
  const presenceRef = services.db.doc(`staffPresence/${uid}`);
  return services.db.runTransaction(async (transaction) => {
    const [user, profile, presence] = await transaction.getAll(userRef, profileRef, presenceRef);
    if (user.data()?.role !== "maestro" || user.data()?.masterId !== uid
      || user.data()?.disabled === true || !profile.exists)
      throw new StaffApiError("Esta cuenta no tiene un acceso de maestro activo.", 403);
    const now = Date.now();
    const next = nextPresence(presence.data(), command, now);
    const isOnline = next.isOnline && profile.data()?.isActive === true;
    transaction.set(presenceRef, { ...next.state, updatedAt: Timestamp.fromMillis(now) });
    transaction.update(profileRef, {
      isOnline,
      presenceExpiresAt: Timestamp.fromMillis(next.expiresAt),
    });
    return { isOnline, expiresAt: next.expiresAt };
  });
}
