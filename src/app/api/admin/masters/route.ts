import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { authorizeAdmin, StaffApiError } from "@/lib/server/firebaseAdmin";
import { validateMasterInput } from "@/lib/masterValidation";
import type { MasterProfile } from "@/types";

const headers = { "Cache-Control": "no-store" };
function failure(cause: unknown): Response {
  if (cause instanceof StaffApiError)
    return Response.json(
      { error: cause.message },
      { status: cause.status, headers },
    );
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? cause.code
      : "";
  if (code === "auth/email-already-exists")
    return Response.json(
      {
        error:
          "Este correo ya está registrado. Actualiza la lista o utiliza otro correo.",
      },
      { status: 409, headers },
    );
  return Response.json(
    {
      error:
        "No se pudo completar la operación. Revisa la configuración del servidor e inténtalo de nuevo.",
    },
    { status: 500, headers },
  );
}
async function payload(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > 3_000_000)
    throw new StaffApiError(
      "La imagen o los datos exceden el tamaño admitido.",
      413,
    );
  const text = await request.text();
  if (text.length > 3_000_000)
    throw new StaffApiError("La imagen excede el tamaño admitido.", 413);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new StaffApiError("Datos JSON no válidos.", 400);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new StaffApiError("Datos no válidos.", 400);
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[^/\\]{1,128}$/.test(value) ||
    value === "." ||
    value === ".."
  )
    throw new StaffApiError("El perfil seleccionado no es válido.", 400);
  return value;
}
async function managedMaster(
  id: string,
  services: Awaited<ReturnType<typeof authorizeAdmin>>,
) {
  const profile = await services.db.doc(`masters/${id}`).get();
  const user = await services.db.doc(`users/${id}`).get();
  if (
    !profile.exists ||
    user.data()?.role !== "maestro" ||
    user.data()?.masterId !== id
  )
    throw new StaffApiError(
      "Este perfil no corresponde a un acceso de maestro gestionable.",
      404,
    );
  return profile;
}
export async function GET(request: Request) {
  try {
    const services = await authorizeAdmin(request);
    const cursor = new URL(request.url).searchParams.get("cursor");
    let query = services.db
      .collection("masters")
      .orderBy(FieldPath.documentId())
      .limit(51);
    if (cursor) query = query.startAfter(identifier(cursor));
    const snapshot = await query.get();
    const page = snapshot.docs.slice(0, 50);
    const roles = page.length
      ? await services.db.getAll(
          ...page.map((item) => services.db.doc(`users/${item.id}`)),
        )
      : [];
    return Response.json(
      {
        entries: page.map((item, index) => ({
          profile: { ...item.data(), id: item.id },
          login: roles[index]?.data()?.email ?? "",
        })),
        nextCursor: snapshot.size > 50 ? (page.at(-1)?.id ?? null) : null,
      },
      { headers },
    );
  } catch (cause) {
    return failure(cause);
  }
}
export async function POST(request: Request) {
  let createdUid: string | null = null;
  let committed = false;
  let services: Awaited<ReturnType<typeof authorizeAdmin>> | null = null;
  try {
    services = await authorizeAdmin(request);
    let input;
    try {
      input = validateMasterInput(await payload(request), true, true);
    } catch (cause) {
      if (cause instanceof StaffApiError) throw cause;
      throw new StaffApiError(
        cause instanceof Error ? cause.message : "Datos incompletos.",
        400,
      );
    }
    const user = await services.auth.createUser({
      email: input.login,
      password: input.password,
      displayName: input.name,
    });
    createdUid = user.uid;
    const avatarUrl = input.avatarUrl;
    const profile: MasterProfile = {
      id: user.uid,
      name: input.name,
      avatarUrl,
      bio: input.bio,
      specialty: input.specialties[0],
      specialties: input.specialties,
      experienceYears: input.experienceYears,
      rating: 0,
      reviewsCount: 0,
      isOnline: false,
      isActive: true,
      isTestProfile: input.isTestProfile,
    };
    const batch = services.db.batch();
    batch.create(services.db.doc(`masters/${user.uid}`), profile);
    batch.create(services.db.doc(`users/${user.uid}`), {
      role: "maestro",
      masterId: user.uid,
      displayName: input.name,
      email: input.login,
      disabled: false,
    });
    batch.set(
      services.db.doc("publicConfig/catalog"),
      { hasMasters: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
    committed = true;
    return Response.json({ id: user.uid }, { status: 201, headers });
  } catch (cause) {
    if (createdUid && !committed && services) {
      // Retain an uncertain committed profile rather than destroying its login on retry.
      try {
        if (!(await services.db.doc(`masters/${createdUid}`).get()).exists)
          await services.auth.deleteUser(createdUid);
      } catch {
        /* A trusted administrator can reconcile an uncertain provisioning attempt. */
      }
    }
    return failure(cause);
  }
}
export async function PATCH(request: Request) {
  try {
    const services = await authorizeAdmin(request);
    const value = await payload(request),
      id = identifier(value.id);
    await managedMaster(id, services);
    const batch = services.db.batch();
    if (
      typeof value.isActive === "boolean" &&
      Object.keys(value).every((key) => key === "id" || key === "isActive")
    ) {
      batch.update(services.db.doc(`masters/${id}`), {
        isActive: value.isActive,
        ...(!value.isActive ? { isOnline: false } : {}),
      });
    } else {
      let input;
      try {
        input = validateMasterInput(value, false, true);
      } catch (cause) {
        throw new StaffApiError(
          cause instanceof Error ? cause.message : "Datos incompletos.",
          400,
        );
      }
      const avatarUrl = input.avatarUrl;
      await services.auth.updateUser(id, {
        email: input.login,
        displayName: input.name,
        ...(input.password ? { password: input.password } : {}),
      });
      if (input.password) await services.auth.revokeRefreshTokens(id);
      batch.update(services.db.doc(`masters/${id}`), {
        name: input.name,
        avatarUrl,
        bio: input.bio,
        specialty: input.specialties[0],
        specialties: input.specialties,
        experienceYears: input.experienceYears,
        isTestProfile: input.isTestProfile,
      });
      batch.update(services.db.doc(`users/${id}`), {
        displayName: input.name,
        email: input.login,
      });
    }
    batch.set(
      services.db.doc("publicConfig/catalog"),
      { hasMasters: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
    return Response.json({ ok: true }, { headers });
  } catch (cause) {
    return failure(cause);
  }
}
export async function DELETE(request: Request) {
  try {
    const services = await authorizeAdmin(request),
      value = await payload(request),
      id = identifier(value.id);
    const profile = await managedMaster(id, services);
    if (profile.data()?.isTestProfile !== true)
      throw new StaffApiError(
        "Solo se pueden eliminar perfiles de prueba.",
        403,
      );
    if (
      !(
        await services.db
          .collection("chats")
          .where("masterId", "==", id)
          .limit(1)
          .get()
      ).empty
    )
      throw new StaffApiError(
        "El perfil tiene conversaciones. Desactiva su visibilidad para conservar el historial.",
        409,
      );
    const hide = services.db.batch();
    hide.update(profile.ref, { isActive: false, isOnline: false });
    hide.update(services.db.doc(`users/${id}`), { disabled: true });
    await hide.commit();
    try {
      await services.auth.deleteUser(id);
    } catch (cause) {
      if (!(
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "auth/user-not-found"
      ))
        throw cause;
    }
    const batch = services.db.batch();
    batch.delete(profile.ref);
    batch.delete(services.db.doc(`users/${id}`));
    batch.set(
      services.db.doc("publicConfig/catalog"),
      { hasMasters: true, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
    return Response.json({ ok: true }, { headers });
  } catch (cause) {
    return failure(cause);
  }
}
