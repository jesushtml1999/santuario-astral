import { assertHostedAvatar } from "@/lib/mediaUploads";
import {
  getLocalStaffSession,
  requireStaff,
  readLocalStaffAccounts,
  hashLocalPassword,
  staffApi,
  STAFF_ACCOUNTS_KEY,
  STAFF_CHANGED,
  type LocalStaffAccount,
} from "@/lib/staffAuth";
import {
  readLocalMasters,
  writeLocalMasters,
  withDirectoryLock,
  MASTERS_KEY,
  MASTERS_CHANGED,
} from "@/lib/localMasters";
import { parseMaster, validateMasterInput } from "@/lib/masterValidation";
import {
  CHAT_CHANGED,
  STORAGE_PREFIX,
  parseRoom,
  readLocalConsultation,
  writeLocalConsultation,
  withLocalRoomLock,
  type ConsultationRoom,
} from "@/lib/consultations";
import type { ChatTag, MasterProfile } from "@/types";
import type {
  DirectoryPage,
  MasterDirectoryEntry,
  MasterEditorInput,
} from "@/types/staff";

function commitLocal(profiles: MasterProfile[], accounts: LocalStaffAccount[]) {
  const beforeProfiles = window.localStorage.getItem(MASTERS_KEY);
  const beforeAccounts = window.localStorage.getItem(STAFF_ACCOUNTS_KEY);
  try {
    window.localStorage.setItem(STAFF_ACCOUNTS_KEY, JSON.stringify(accounts));
    window.localStorage.setItem(MASTERS_KEY, JSON.stringify(profiles));
  } catch {
    if (beforeAccounts !== null)
      window.localStorage.setItem(STAFF_ACCOUNTS_KEY, beforeAccounts);
    if (beforeProfiles !== null)
      window.localStorage.setItem(MASTERS_KEY, beforeProfiles);
    throw new Error(
      "No hay espacio suficiente para guardar los cambios locales.",
    );
  }
  window.dispatchEvent(new Event(MASTERS_CHANGED));
  window.dispatchEvent(new Event(STAFF_CHANGED));
}

export async function getMasterDirectory(
  cursor?: string,
): Promise<DirectoryPage> {
  const session = await requireStaff("admin");
  if (session.mode === "local") {
    const accounts = readLocalStaffAccounts();
    return {
      entries: readLocalMasters().map((profile) => ({
        profile,
        login:
          accounts.find((account) => account.masterId === profile.id)?.email ??
          "",
      })),
      nextCursor: null,
    };
  }
  const value = await staffApi(
    "/api/admin/masters" +
      (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    !("entries" in value) ||
    !Array.isArray(value.entries)
  )
    throw new Error("La respuesta del directorio no es válida.");
  const entries: MasterDirectoryEntry[] = [];
  for (const item of value.entries) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("profile" in item) ||
      !("login" in item) ||
      typeof item.login !== "string" ||
      typeof item.profile !== "object" ||
      item.profile === null ||
      !("id" in item.profile) ||
      typeof item.profile.id !== "string"
    )
      throw new Error("Perfil administrativo no válido.");
    const profile = parseMaster(item.profile.id, item.profile);
    if (!profile) throw new Error("Perfil administrativo incompleto.");
    entries.push({
      profile,
      login: item.login,
      accessPending: "accessPending" in item && item.accessPending === true,
    });
  }
  return {
    entries,
    nextCursor:
      "nextCursor" in value && typeof value.nextCursor === "string"
        ? value.nextCursor
        : null,
  };
}

export async function saveManagedMaster(
  raw: MasterEditorInput,
  id?: string,
  accessPending = false,
): Promise<void> {
  const session = await requireStaff("admin");
  const input = validateMasterInput(
    raw, !id, session.mode === "firebase", accessPending,
  );
  if (session.mode === "firebase") {
    await staffApi("/api/admin/masters", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify({ id, ...input }),
    });
    return;
  }
  const salt = window.crypto.randomUUID();
  const passwordHash = input.password
    ? await hashLocalPassword(input.password, salt)
    : null;
  await withDirectoryLock(async () => {
    await requireStaff("admin");
    const profiles = readLocalMasters(),
      accounts = readLocalStaffAccounts();
    const existing = id ? profiles.find((profile) => profile.id === id) : null;
    if (id && !existing) throw new Error("Este maestro ya no existe.");
    if (
      accounts.some(
        (account) => account.email === input.login && account.masterId !== id,
      )
    )
      throw new Error("Este correo o usuario ya está en uso.");
    const masterId = id ?? "local-" + window.crypto.randomUUID();
    const profile: MasterProfile = {
      id: masterId,
      name: input.name,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
      specialty: input.specialties[0],
      specialties: input.specialties,
      experienceYears: input.experienceYears,
      isActive: existing?.isActive ?? true,
      isOnline: existing?.isOnline ?? false,
      rating: existing?.rating ?? 0,
      reviewsCount: existing?.reviewsCount ?? 0,
      isTestProfile: true,
    };
    const account = accounts.find((item) => item.masterId === masterId);
    if (!account && !passwordHash)
      throw new Error(
        "Indica una contraseña para crear el acceso del maestro.",
      );
    const updated: LocalStaffAccount = account
      ? {
          ...account,
          displayName: input.name,
          email: input.login,
          ...(passwordHash
            ? { salt, passwordHash, version: account.version + 1 }
            : {}),
        }
      : {
          uid: "staff-" + masterId,
          masterId,
          role: "maestro",
          displayName: input.name,
          email: input.login,
          salt,
          passwordHash: passwordHash!,
          version: 1,
          disabled: false,
        };
    commitLocal(
      existing
        ? profiles.map((item) => (item.id === masterId ? profile : item))
        : [...profiles, profile],
      account
        ? accounts.map((item) => (item.uid === account.uid ? updated : item))
        : [...accounts, updated],
    );
  });
}

export async function setMasterVisibility(
  id: string,
  visible: boolean,
): Promise<void> {
  const session = await requireStaff("admin");
  if (session.mode === "firebase") {
    await staffApi("/api/admin/masters", {
      method: "PATCH",
      body: JSON.stringify({ id, isActive: visible }),
    });
    return;
  }
  await withDirectoryLock(async () => {
    await requireStaff("admin");
    const profiles = readLocalMasters();
    if (!profiles.some((profile) => profile.id === id))
      throw new Error("Este maestro ya no existe.");
    writeLocalMasters(
      profiles.map((profile) =>
        profile.id === id
          ? {
              ...profile,
              isActive: visible,
              ...(!visible ? { isOnline: false } : {}),
            }
          : profile,
      ),
    );
  });
}

export async function deleteTestMaster(id: string): Promise<void> {
  const session = await requireStaff("admin");
  if (session.mode === "firebase") {
    await staffApi("/api/admin/masters", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    return;
  }
  await withDirectoryLock(async () => {
    await requireStaff("admin");
    const profiles = readLocalMasters(),
      profile = profiles.find((item) => item.id === id);
    if (!profile?.isTestProfile)
      throw new Error("Solo se pueden eliminar perfiles de prueba.");
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (
        key?.startsWith(STORAGE_PREFIX) &&
        key.slice(STORAGE_PREFIX.length + 37) === id
      )
        throw new Error(
          "Este perfil tiene conversaciones. Desactiva su visibilidad para conservar el historial.",
        );
    }
    commitLocal(
      profiles.filter((item) => item.id !== id),
      readLocalStaffAccounts().filter((item) => item.masterId !== id),
    );
  });
}

export function subscribeOwnMaster(
  masterId: string,
  next: (profile: MasterProfile | null) => void,
  onError: (cause: unknown) => void,
): () => void {
  let active = true;
  const cleanups: Array<() => void> = [];
  void requireStaff("maestro")
    .then(async (session) => {
      if (!active) return;
      if (session.masterId !== masterId)
        throw new Error("No puedes editar el perfil de otro maestro.");
      if (session.mode === "local") {
        const refresh = () => {
          if (active) {
            try {
              const current = getLocalStaffSession();
              if (
                current?.role !== "maestro" ||
                current.masterId !== masterId
              ) {
                onError(new Error("Tu sesión cambió."));
                return;
              }
              next(
                readLocalMasters().find((item) => item.id === masterId) ?? null,
              );
            } catch (cause) {
              onError(cause);
            }
          }
        };
        window.addEventListener(MASTERS_CHANGED, refresh);
        window.addEventListener("storage", refresh);
        cleanups.push(() => {
          window.removeEventListener(MASTERS_CHANGED, refresh);
          window.removeEventListener("storage", refresh);
        });
        refresh();
      } else {
        const { staffDb } = await import("@/lib/staffFirebase");
        const { doc, onSnapshot } = await import("firebase/firestore");
        if (active)
          cleanups.push(
            onSnapshot(
              doc(staffDb, "masters", masterId),
              (snapshot) => {
                if (active)
                  next(
                    snapshot.exists()
                      ? parseMaster(masterId, snapshot.data())
                      : null,
                  );
              },
              onError,
            ),
          );
      }
    })
    .catch((cause) => {
      if (active) onError(cause);
    });
  return () => {
    active = false;
    cleanups.forEach((stop) => stop());
  };
}

export async function setOwnAvailability(online: boolean) {
  const session = await requireStaff("maestro");
  if (!session.masterId)
    throw new Error("Tu cuenta no tiene un perfil asignado.");
  if (session.mode === "local") {
    await withDirectoryLock(async () => {
      await requireStaff("maestro");
      writeLocalMasters(
        readLocalMasters().map((profile) =>
          profile.id === session.masterId
            ? { ...profile, isOnline: online }
            : profile,
        ),
      );
    });
  } else {
    const { staffDb } = await import("@/lib/staffFirebase");
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(staffDb, "masters", session.masterId), {
      isOnline: online,
    });
  }
}

export async function saveOwnProfile(input: {
  bio: string;
  specialties: string[];
  avatarUrl: string;
}) {
  const session = await requireStaff("maestro");
  if (!session.masterId) throw new Error("No tienes un perfil asignado.");
  const valid = validateMasterInput(
    {
      ...input,
      name: session.displayName,
      experienceYears: 0,
      login: session.email || "staff",
      isTestProfile: false,
    },
    false,
    false,
  );
  if (session.mode === "local") {
    await withDirectoryLock(async () => {
      await requireStaff("maestro");
      writeLocalMasters(
        readLocalMasters().map((profile) =>
          profile.id === session.masterId
            ? {
                ...profile,
                bio: valid.bio,
                specialties: valid.specialties,
                specialty: valid.specialties[0],
                avatarUrl: valid.avatarUrl,
              }
            : profile,
        ),
      );
    });
    return;
  }
  assertHostedAvatar(valid.avatarUrl);
  const { staffDb } = await import("@/lib/staffFirebase");
  const avatarUrl = valid.avatarUrl;
  const { doc, updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(staffDb, "masters", session.masterId), {
    bio: valid.bio,
    specialties: valid.specialties,
    specialty: valid.specialties[0],
    avatarUrl,
  });
}

export function subscribeMasterInbox(
  masterId: string,
  next: (rooms: ConsultationRoom[]) => void,
  onError: (cause: unknown) => void,
): () => void {
  let active = true;
  const cleanups: Array<() => void> = [];
  void requireStaff("maestro")
    .then(async (session) => {
      if (!active) return;
      if (session.masterId !== masterId)
        throw new Error("No puedes acceder a la bandeja de otro maestro.");
      if (session.mode === "local") {
        const refresh = () => {
          if (!active) return;
          try {
            if (getLocalStaffSession()?.masterId !== masterId)
              throw new Error("Tu sesión cambió.");
            const rooms: ConsultationRoom[] = [];
            for (let index = 0; index < window.localStorage.length; index++) {
              const key = window.localStorage.key(index);
              if (
                key?.startsWith(STORAGE_PREFIX) &&
                key.slice(STORAGE_PREFIX.length + 37) === masterId
              ) {
                const value = readLocalConsultation(
                  key.slice(STORAGE_PREFIX.length),
                );
                if (value)
                  rooms.push({
                    ...value.room,
                    initialTopic:
                      value.room.initialTopic ??
                      value.messages.find(
                        (message) =>
                          message.senderRole === "cliente" &&
                          message.type === "text",
                      )?.text,
                  });
              }
            }
            next(
              rooms.sort(
                (a, b) =>
                  Date.parse(b.lastMessageAt ?? "") -
                  Date.parse(a.lastMessageAt ?? ""),
              ),
            );
          } catch (cause) {
            onError(cause);
          }
        };
        for (const event of [CHAT_CHANGED, STAFF_CHANGED, "storage", "focus"]) {
          window.addEventListener(event, refresh);
          cleanups.push(() => window.removeEventListener(event, refresh));
        }
        refresh();
      } else {
        const { staffDb } = await import("@/lib/staffFirebase");
        const { collection, query, where, onSnapshot } =
          await import("firebase/firestore");
        if (active)
          cleanups.push(
            onSnapshot(
              query(
                collection(staffDb, "chats"),
                where("masterId", "==", masterId),
              ),
              (snapshot) => {
                const rooms = snapshot.docs.map((document) =>
                  parseRoom(document.id, document.data()),
                );
                if (rooms.some((room) => !room || room.masterId !== masterId)) {
                  onError(new Error("La bandeja contiene datos de otra sala."));
                  return;
                }
                if (active)
                  next(
                    rooms
                      .filter((room): room is ConsultationRoom => room !== null)
                      .sort(
                        (a, b) =>
                          Date.parse(b.lastMessageAt ?? "") -
                          Date.parse(a.lastMessageAt ?? ""),
                      ),
                  );
              },
              onError,
            ),
          );
      }
    })
    .catch((cause) => {
      if (active) onError(cause);
    });
  return () => {
    active = false;
    cleanups.forEach((stop) => stop());
  };
}

export async function setChatTag(roomId: string, tag: ChatTag) {
  if (!["Nuevo", "En consulta", "Interesado", "Pagado"].includes(tag))
    throw new Error("Etiqueta no válida.");
  const session = await requireStaff("maestro");
  if (roomId.slice(37) !== session.masterId)
    throw new Error("Esta sala no pertenece a tu bandeja.");
  if (session.mode === "local") {
    await withLocalRoomLock(roomId, () => {
      const value = readLocalConsultation(roomId);
      if (!value || value.room.masterId !== session.masterId)
        throw new Error("La conversación ya no está disponible.");
      writeLocalConsultation({
        ...value,
        room: { ...value.room, statusTag: tag },
      });
    });
  } else {
    const { staffDb } = await import("@/lib/staffFirebase");
    const { doc, updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(staffDb, "chats", roomId), { statusTag: tag });
  }
}
