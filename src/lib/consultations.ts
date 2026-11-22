import { Timestamp } from "firebase/firestore";
import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";
import { getOrCreateGuestId } from "@/lib/guestSession";
import { ensureVisitorUser, resolveCloudActor } from "@/lib/chatIdentity";
import { getLocalStaffSession } from "@/lib/staffAuth";
import type {
  ChatMessage,
  ChatRoom,
  ClientLeadData,
  MasterProfile,
} from "@/types";

// JSON timestamps are ISO strings; Firestore domain models retain Timestamp types.
export type ConsultationRoom = Omit<ChatRoom, "lastMessageAt"> & {
  lastMessageAt: string | null;
};
export type ConsultationMessage = Omit<ChatMessage, "createdAt"> & {
  createdAt: string | null;
};
export interface ConsultationRecord {
  room: ConsultationRoom;
  messages: ConsultationMessage[];
  mode: "local" | "firestore";
  isDemo: boolean;
}

export const STORAGE_PREFIX = "santuario-astral:chat:";
export const CHAT_CHANGED = "santuario-astral:chats-changed";

export function consultationRoomId(
  guestId: string,
  masterId: string,
): ChatRoom["id"] {
  if (
    !guestId ||
    !masterId ||
    masterId.length > 128 ||
    /[/\\\u0000-\u001f]/.test(masterId) ||
    masterId === "." ||
    masterId === ".."
  ) {
    throw new Error("No se pudo identificar esta conversación.");
  }
  return `${guestId}_${masterId}`;
}

export function assertOwnRoom(roomId: string): {
  guestId: string;
  masterId: string;
} {
  // Local session guard only. Real cloud access must also be enforced by Firestore rules.
  const guestId = getOrCreateGuestId();
  if (!guestId || !roomId.startsWith(`${guestId}_`)) {
    throw new Error(
      "Esta conversación no pertenece a tu sesión en este navegador.",
    );
  }
  const masterId = roomId.slice(guestId.length + 1);
  consultationRoomId(guestId, masterId);
  return { guestId, masterId };
}

export function assertLocalRoomAccess(roomId: string): {
  guestId: string;
  masterId: string;
} {
  const staff = getLocalStaffSession();
  if (staff?.role === "maestro") {
    if (roomId.slice(37) !== staff.masterId)
      throw new Error("Esta sala no pertenece al maestro actual.");
    return { guestId: roomId.slice(0, 36), masterId: staff.masterId };
  }
  return assertOwnRoom(roomId);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value)))
    return value;
  return null;
}

export function parseRoom(
  roomId: string,
  value: unknown,
): ConsultationRoom | null {
  if (!record(value)) return null;
  const keys = [
    "guestId",
    "masterId",
    "clientName",
    "clientZodiac",
    "masterName",
    "masterAvatar",
    "lastMessage",
  ] as const;
  if (keys.some((key) => typeof value[key] !== "string")) return null;
  if (
    roomId !== `${value.guestId}_${value.masterId}` ||
    typeof value.unreadByMaster !== "number" ||
    !Number.isInteger(value.unreadByMaster) ||
    value.unreadByMaster < 0 ||
    typeof value.unreadByClient !== "number" ||
    !Number.isInteger(value.unreadByClient) ||
    value.unreadByClient < 0 ||
    !["Nuevo", "En consulta", "Interesado", "Pagado"].includes(
      String(value.statusTag),
    )
  )
    return null;
  return {
    ...(typeof value.clientAuthUid === "string"
      ? { clientAuthUid: value.clientAuthUid }
      : {}),
    ...(typeof value.initialTopic === "string"
      ? { initialTopic: value.initialTopic }
      : {}),
    ...(typeof value.lastMessageId === "string"
      ? { lastMessageId: value.lastMessageId }
      : {}),
    id: roomId as ChatRoom["id"],
    guestId: String(value.guestId),
    masterId: String(value.masterId),
    clientName: String(value.clientName),
    clientZodiac: String(value.clientZodiac),
    masterName: String(value.masterName),
    masterAvatar: String(value.masterAvatar),
    lastMessage: String(value.lastMessage),
    lastMessageAt: timestamp(value.lastMessageAt),
    unreadByMaster: value.unreadByMaster,
    unreadByClient: value.unreadByClient,
    statusTag: value.statusTag as ChatRoom["statusTag"],
  };
}

export function parseMessage(value: unknown): ConsultationMessage | null {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    typeof value.senderId !== "string" ||
    (value.senderRole !== "cliente" && value.senderRole !== "maestro") ||
    (value.type !== "text" &&
      value.type !== "image" &&
      value.type !== "audio") ||
    (value.text !== undefined && typeof value.text !== "string") ||
    (value.mediaUrl !== undefined && typeof value.mediaUrl !== "string")
  )
    return null;
  return {
    id: value.id,
    ...(typeof value.storagePath === "string"
      ? { storagePath: value.storagePath }
      : {}),
    senderId: value.senderId,
    senderRole: value.senderRole,
    type: value.type,
    ...(typeof value.text === "string" ? { text: value.text } : {}),
    ...(typeof value.mediaUrl === "string" ? { mediaUrl: value.mediaUrl } : {}),
    createdAt: timestamp(value.createdAt),
  };
}

export function readLocalConsultation(
  roomId: string,
): ConsultationRecord | null {
  const { guestId, masterId } = assertLocalRoomAccess(roomId);
  let serialized: string | null;
  try {
    serialized = window.localStorage.getItem(STORAGE_PREFIX + roomId);
  } catch {
    throw new Error(
      "El navegador no permite acceder a tus conversaciones guardadas.",
    );
  }
  if (!serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (
      !record(value) ||
      value.version !== 1 ||
      typeof value.isDemo !== "boolean" ||
      !Array.isArray(value.messages)
    )
      throw new Error("Invalid local conversation envelope");
    const room = parseRoom(roomId, value.room);
    const messages = value.messages.map(parseMessage);
    if (
      !room ||
      room.guestId !== guestId ||
      room.masterId !== masterId ||
      messages.some((message) => message === null)
    )
      throw new Error("Invalid local conversation data");
    if (
      messages.some(
        (message) =>
          message &&
          message.senderId !==
            (message.senderRole === "cliente" ? room.guestId : room.masterId),
      )
    ) {
      throw new Error("A message belongs to another participant");
    }
    return {
      room,
      messages: messages.filter(
        (message): message is ConsultationMessage => message !== null,
      ),
      isDemo: value.isDemo,
      mode: "local",
    };
  } catch {
    throw new Error(
      "No pudimos leer la conversación guardada. Tus datos no se han modificado.",
    );
  }
}

export function writeLocalConsultation(value: ConsultationRecord): void {
  assertLocalRoomAccess(value.room.id);
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + value.room.id,
      JSON.stringify({
        version: 1,
        room: value.room,
        messages: value.messages,
        isDemo: value.isDemo,
      }),
    );
  } catch {
    throw new Error(
      "No pudimos guardar el mensaje. Permite el almacenamiento o libera espacio en este navegador.",
    );
  }
  window.dispatchEvent(
    new CustomEvent(CHAT_CHANGED, { detail: value.room.id }),
  );
}

/** The critical section stays synchronous, with a cross-tab Web Lock when supported. */
export function withLocalRoomLock<T>(
  roomId: string,
  action: () => T,
): Promise<T> {
  assertLocalRoomAccess(roomId);
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(`santuario-astral:room:${roomId}`, action);
  return Promise.resolve().then(action);
}

export async function getConsultation(
  roomId: string,
  localOnly = false,
): Promise<ConsultationRecord | null> {
  assertOwnRoom(roomId);
  if (localOnly || !isFirebaseConfigured())
    return readLocalConsultation(roomId);
  // A demonstration room must never be submitted to a real Firebase project.
  const local = readLocalConsultation(roomId);
  if (local?.isDemo) return local;
  const { db } = await import("@/lib/firebase");
  await ensureVisitorUser();
  const {
    collection,
    doc,
    getDocFromServer,
    getDocsFromServer,
    orderBy,
    query,
  } = await import("firebase/firestore");
  const roomRef = doc(db, "chats", roomId);
  const snapshot = await getDocFromServer(roomRef);
  if (!snapshot.exists()) return local;
  const room = parseRoom(roomId, snapshot.data());
  if (!room) throw new Error("No pudimos leer los datos de esta conversación.");
  await resolveCloudActor(room);
  const messagesSnapshot = await getDocsFromServer(
    query(collection(roomRef, "messages"), orderBy("createdAt", "asc")),
  );
  const messages = messagesSnapshot.docs
    .map((message) => parseMessage({ ...message.data(), id: message.id }))
    .filter((message): message is ConsultationMessage => message !== null);
  return { room, messages, mode: "firestore", isDemo: false };
}

/** One stable request ID per form submission makes retries idempotent. */
export async function startConsultation(
  master: MasterProfile,
  lead: ClientLeadData,
  options: { isDemo: boolean; requestId: string },
): Promise<string> {
  const roomId = consultationRoomId(lead.guestId, master.id);
  assertOwnRoom(roomId);
  const name = lead.name.trim();
  const zodiac = lead.birthDateOrSign?.trim() ?? "";
  const topic = lead.initialTopic.trim();
  if (
    !name ||
    name.length > 80 ||
    zodiac.length > 80 ||
    !topic ||
    topic.length > 2000 ||
    !master.isActive ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(options.requestId)
  ) {
    throw new Error("Revisa tu nombre y tu pregunta antes de continuar.");
  }
  const messageId = `intake_${options.requestId}`;
  const room: ConsultationRoom = {
    id: roomId,
    guestId: lead.guestId,
    masterId: master.id,
    clientName: name,
    clientZodiac: zodiac,
    masterName: master.name,
    masterAvatar: master.avatarUrl,
    statusTag: "Nuevo",
    unreadByMaster: 1,
    unreadByClient: 0,
    lastMessage: topic,
    lastMessageId: messageId,
    initialTopic: topic,
    lastMessageAt: new Date().toISOString(),
  };
  const message: ConsultationMessage = {
    id: messageId,
    senderId: lead.guestId,
    senderRole: "cliente",
    type: "text",
    text: topic,
    createdAt: room.lastMessageAt,
  };
  if (options.isDemo || !isFirebaseConfigured()) {
    await withLocalRoomLock(roomId, () => {
      const previous = readLocalConsultation(roomId);
      if (previous?.messages.some((item) => item.id === messageId)) return;
      room.initialTopic =
        previous?.room.initialTopic ??
        previous?.messages.find(
          (item) => item.senderRole === "cliente" && item.type === "text",
        )?.text ??
        topic;
      room.unreadByMaster = (previous?.room.unreadByMaster ?? 0) + 1;
      room.unreadByClient = previous?.room.unreadByClient ?? 0;
      writeLocalConsultation({
        room,
        messages: [...(previous?.messages ?? []), message],
        isDemo: options.isDemo,
        mode: "local",
      });
    });
    return roomId;
  }

  const { db } = await import("@/lib/firebase");
  const user = await ensureVisitorUser();
  const { doc, runTransaction, serverTimestamp } =
    await import("firebase/firestore");
  const roomRef = doc(db, "chats", roomId);
  const messageRef = doc(roomRef, "messages", messageId);
  await runTransaction(db, async (transaction) => {
    const existingMessage = await transaction.get(messageRef);
    if (existingMessage.exists()) return;
    const existingRoom = await transaction.get(roomRef);
    const previous = existingRoom.exists()
      ? parseRoom(roomId, existingRoom.data())
      : null;
    if (
      existingRoom.exists() &&
      (!previous || previous.clientAuthUid !== user.uid)
    )
      throw new Error("Tu sesión no tiene acceso a esta conversación.");
    transaction.set(
      roomRef,
      {
        ...room,
        clientAuthUid: user.uid,
        initialTopic: previous?.initialTopic ?? topic,
        unreadByMaster: (previous?.unreadByMaster ?? 0) + 1,
        unreadByClient: previous?.unreadByClient ?? 0,
        lastMessageAt: serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(messageRef, { ...message, createdAt: serverTimestamp() });
  });
  return roomId;
}
