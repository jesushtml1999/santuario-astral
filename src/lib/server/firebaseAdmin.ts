import "server-only";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class StaffApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function getAdminServices() {
  let app = getApps().find((item) => item.name === "santuario-admin");
  if (!app) {
    const projectId =
      process.env.FIREBASE_ADMIN_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (
      !projectId ||
      (!process.env.GOOGLE_APPLICATION_CREDENTIALS &&
        (!clientEmail || !privateKey))
    )
      throw new StaffApiError(
        "La administración de Firebase aún no está configurada en el servidor.",
        503,
      );
    app = initializeApp(
      {
        projectId,
        credential:
          clientEmail && privateKey
            ? cert({
                projectId,
                clientEmail,
                privateKey: privateKey.replace(/\\n/g, "\n"),
              })
            : applicationDefault(),
      },
      "santuario-admin",
    );
  }
  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
export async function authorizeAdmin(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new StaffApiError("Inicia sesión como administrador.", 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new StaffApiError("Origen no permitido.", 403);
  const services = getAdminServices();
  let uid: string;
  try {
    uid = (await services.auth.verifyIdToken(token, true)).uid;
  } catch {
    throw new StaffApiError(
      "Tu sesión no es válida. Vuelve a iniciar sesión.",
      401,
    );
  }
  const user = await services.db.doc(`users/${uid}`).get();
  if (user.data()?.role !== "admin" || user.data()?.disabled === true)
    throw new StaffApiError("Esta operación requiere un administrador.", 403);
  return services;
}
