import { uploadChatMedia } from "@/lib/cloudMedia";
import { normalizeCountryCode } from "@/lib/countries";
import { getOrCreateGuestId } from "@/lib/guestSession";
import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";
import {
  ensureChatUser,
  ensureVisitorUser,
  getChatBackend,
  resolveCloudActor,
  type ChatActor,
} from "@/lib/chatIdentity";
import {
  readLocalMasters,
  MASTERS_CHANGED,
  MASTERS_KEY,
} from "@/lib/localMasters";
import { getLocalStaffSession, STAFF_CHANGED } from "@/lib/staffAuth";
import {
  assertLocalRoomAccess,
  CHAT_CHANGED,
  STORAGE_PREFIX,
  parseMessage,
  parseRoom,
  readLocalConsultation,
  withLocalRoomLock,
  writeLocalConsultation,
  type ConsultationMessage,
  type ConsultationRoom,
} from "@/lib/consultations";

export interface ChatSession {
  room: ConsultationRoom;
  mode: "local" | "firestore";
  isDemo: boolean;
  actor: ChatActor;
}
export type LiveMessage = ConsultationMessage & { pending?: boolean };
export interface LiveChatState {
  masterCountryCode: string;
  session: ChatSession;
  messages: LiveMessage[];
  isOnline: boolean | null;
  fromCache: boolean;
}
export type OutgoingMessage =
  | { type: "text"; text: string; messageId: string }
  | { type: "image" | "audio"; file: Blob; messageId: string };

export const LOCAL_MEDIA_LIMIT = 2 * 1024 * 1024;
export const IMAGE_LIMIT = 5 * 1024 * 1024;
export const AUDIO_LIMIT = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

export function chatErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.name === "AbortError")
    return "Envío cancelado.";
  if (cause instanceof Error && !cause.name.includes("Firebase"))
    return cause.message;
  return "No pudimos conectar con esta conversación. Revisa tu conexión y los permisos de tu sesión e inténtalo de nuevo.";
}

function validRoomId(roomId: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[^/\\]{1,128}$/i.test(
      roomId,
    )
  ) {
    throw new Error("La dirección de esta conversación no es válida.");
  }
}

export async function openChatSession(roomId: string): Promise<ChatSession> {
  validRoomId(roomId);
  const guestId = getOrCreateGuestId();
  const staff = getLocalStaffSession();
  const local =
    (staff?.role === "maestro" && staff.masterId === roomId.slice(37)) ||
    (guestId && roomId.startsWith(`${guestId}_`))
      ? readLocalConsultation(roomId)
      : null;
  if (
    !isFirebaseConfigured() ||
    local?.isDemo ||
    roomId.slice(37).startsWith("demo-")
  ) {
    assertLocalRoomAccess(roomId);
    if (!local)
      throw new Error(
        "No encontramos esta conversación en tu sesión. Inicia una consulta desde el perfil del maestro.",
      );
    return {
      room: local.room,
      mode: "local",
      isDemo: local.isDemo,
      actor:
        staff?.role === "maestro"
          ? { id: staff.masterId!, role: "maestro", authUid: staff.uid }
          : { id: local.room.guestId, role: "cliente", authUid: "" },
    };
  }
  await ensureChatUser();
  const { db } = await getChatBackend();
  const { doc, getDocFromServer } = await import("firebase/firestore");
  const snapshot = await getDocFromServer(doc(db, "chats", roomId));
  const room = snapshot.exists() ? parseRoom(roomId, snapshot.data()) : null;
  if (!room) throw new Error("Esta conversación no está disponible.");
  const actor = await resolveCloudActor(room);
  return { room, actor, mode: "firestore", isDemo: false };
}

function participantMessage(
  message: ConsultationMessage,
  room: ConsultationRoom,
): boolean {
  return (
    message.senderId ===
    (message.senderRole === "cliente" ? room.guestId : room.masterId)
  );
}

function chronological(messages: LiveMessage[]): LiveMessage[] {
  return [...messages].sort((a, b) => {
    const difference =
      (a.createdAt ? Date.parse(a.createdAt) : Number.MAX_SAFE_INTEGER) -
      (b.createdAt ? Date.parse(b.createdAt) : Number.MAX_SAFE_INTEGER);
    // Preserve Firestore's nanosecond order (and local append order) on millisecond ties.
    return difference;
  });
}

/** Each subscription captures one immutable room ID and tears down every listener. */
export function subscribeToChat(
  roomId: string,
  next: (state: LiveChatState) => void,
  onError: (error: unknown) => void,
): () => void {
  let disposed = false;
  const cleanups: Array<() => void> = [];
  const stop = () => {
    disposed = true;
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
  const fail = (error: unknown) => {
    if (!disposed) {
      stop();
      onError(error);
    }
  };
  void openChatSession(roomId)
    .then(async (session) => {
      if (disposed) return;
      if (session.mode === "local") {
        const emit = () => {
          if (disposed) return;
          try {
            const currentStaff = getLocalStaffSession();
            if (
              (session.actor.role === "maestro" &&
                (currentStaff?.role !== "maestro" ||
                  currentStaff.masterId !== session.actor.id)) ||
              (session.actor.role === "cliente" &&
                currentStaff?.role === "maestro")
            )
              throw new Error(
                "Tu sesión cambió. Vuelve a abrir la conversación.",
              );
            const stored = readLocalConsultation(roomId);
            if (!stored)
              throw new Error(
                "Esta conversación ya no está guardada en este navegador.",
              );
            const master = readLocalMasters().find(
              (profile) => profile.id === stored.room.masterId,
            );
            next({
              session: {
                ...session,
                room: {
                  ...stored.room,
                  masterName: master?.name ?? stored.room.masterName,
                  masterAvatar: master?.avatarUrl ?? stored.room.masterAvatar,
                },
              },
              messages: chronological(stored.messages),
              isOnline: master?.isOnline ?? null,
              masterCountryCode: normalizeCountryCode(master?.countryCode),
              fromCache: false,
            });
          } catch (error) {
            fail(error);
          }
        };
        const onLocal = (event: Event) => {
          if (event instanceof CustomEvent && event.detail === roomId) emit();
        };
        const onStorage = (event: StorageEvent) => {
          if (
            event.key === STORAGE_PREFIX + roomId ||
            event.key === "santuario-astral:guest-id" ||
            event.key === MASTERS_KEY ||
            event.key === null
          )
            emit();
        };
        window.addEventListener(CHAT_CHANGED, onLocal);
        window.addEventListener("storage", onStorage);
        window.addEventListener("focus", emit);
        window.addEventListener(STAFF_CHANGED, emit);
        window.addEventListener(MASTERS_CHANGED, emit);
        cleanups.push(() => {
          window.removeEventListener(CHAT_CHANGED, onLocal);
          window.removeEventListener("storage", onStorage);
          window.removeEventListener("focus", emit);
          window.removeEventListener(STAFF_CHANGED, emit);
          window.removeEventListener(MASTERS_CHANGED, emit);
        });
        emit();
        return;
      }

      const { db, auth } = await getChatBackend();
      const { collection, doc, onSnapshot, orderBy, query } =
        await import("firebase/firestore");
      const { onAuthStateChanged } = await import("firebase/auth");
      if (disposed) return;
      let room = session.room;
      let messages: LiveMessage[] = [];
      let messagesReady = false;
      let roomReady = false;
      let isOnline: boolean | null = null;
      let masterCountryCode = "";
      let fromCache = false;
      const emit = () => {
        if (!disposed && roomReady && messagesReady)
          next({
            session: { ...session, room },
            messages,
            isOnline,
            masterCountryCode,
            fromCache,
          });
      };
      cleanups.push(
        onAuthStateChanged(auth, (user) => {
          if (user?.uid !== session.actor.authUid)
            fail(
              new Error("Tu sesión cambió. Vuelve a abrir la conversación."),
            );
        }),
      );
      cleanups.push(
        onSnapshot(
          doc(db, "chats", roomId),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (disposed) return;
            const parsed = snapshot.exists()
              ? parseRoom(
                  roomId,
                  snapshot.data({ serverTimestamps: "estimate" }),
                )
              : null;
            if (
              !parsed ||
              (session.actor.role === "cliente"
                ? parsed.clientAuthUid !== session.actor.authUid
                : parsed.masterId !== session.actor.id)
            ) {
              fail(new Error("Ya no tienes acceso a esta conversación."));
              return;
            }
            room = parsed;
            roomReady = true;
            fromCache = snapshot.metadata.fromCache;
            emit();
          },
          fail,
        ),
      );
      cleanups.push(
        onSnapshot(
          query(
            collection(db, "chats", roomId, "messages"),
            orderBy("createdAt", "asc"),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (disposed) return;
            const parsed = snapshot.docs.map((item) => {
              const message = parseMessage({
                ...item.data({ serverTimestamps: "estimate" }),
                id: item.id,
              });
              return message && participantMessage(message, room)
                ? { ...message, pending: item.metadata.hasPendingWrites }
                : null;
            });
            if (parsed.some((message) => message === null)) {
              fail(
                new Error(
                  "Un mensaje no corresponde a los participantes de esta sala.",
                ),
              );
              return;
            }
            messages = chronological(
              parsed.filter(
                (message): message is LiveMessage & { pending: boolean } =>
                  message !== null,
              ),
            );
            messagesReady = true;
            emit();
          },
          fail,
        ),
      );
      cleanups.push(
        onSnapshot(
          doc(db, "masters", room.masterId),
          (snapshot) => {
            const value: unknown = snapshot.data();
            masterCountryCode = normalizeCountryCode(
              typeof value === "object" &&
                value !== null &&
                "countryCode" in value
                ? value.countryCode
                : "",
            );
            isOnline =
              typeof value === "object" &&
              value !== null &&
              "isOnline" in value &&
              typeof value.isOnline === "boolean"
                ? value.isOnline
                : null;
            if (typeof value === "object" && value !== null) {
              room = {
                ...room,
                ...("name" in value && typeof value.name === "string"
                  ? { masterName: value.name }
                  : {}),
                ...("avatarUrl" in value && typeof value.avatarUrl === "string"
                  ? { masterAvatar: value.avatarUrl }
                  : {}),
              };
            }
            emit();
          },
          () => {
            isOnline = null;
            masterCountryCode = "";
            emit();
          },
        ),
      );
    })
    .catch(fail);
  return stop;
}

export function safeChatMediaUrl(
  value: string | undefined,
  kind: "image" | "audio",
  scope: { roomId: string; storagePath?: string; local: boolean },
): string | null {
  if (!value) return null;
  const pattern =
    kind === "image"
      ? /^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=\s]+$/i
      : /^data:audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(?:;codecs=[a-z0-9.,-]+)?;base64,[a-z0-9+/=\s]+$/i;
  if (pattern.test(value)) return scope.local ? value : null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname !== "firebasestorage.googleapis.com"
    )
      return null;
    if (!scope.storagePath?.startsWith(`chat_media/${scope.roomId}/`))
      return null;
    const marker = url.pathname.indexOf("/o/");
    return marker >= 0 &&
      decodeURIComponent(url.pathname.slice(marker + 3)) === scope.storagePath
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function mediaType(
  file: Blob,
  kind: "image" | "audio",
  local: boolean,
): string {
  const mime = file.type.split(";")[0].toLowerCase();
  if (!(kind === "image" ? IMAGE_TYPES : AUDIO_TYPES).has(mime))
    throw new Error(
      kind === "image"
        ? "Selecciona una imagen JPG, PNG, WebP o GIF."
        : "Este formato de audio no es compatible.",
    );
  const limit = local
    ? LOCAL_MEDIA_LIMIT
    : kind === "image"
      ? IMAGE_LIMIT
      : AUDIO_LIMIT;
  if (file.size <= 0 || file.size > limit)
    throw new Error(
      `El archivo debe contener datos y no superar ${limit / 1024 / 1024} MB${local ? " en modo local" : ""}.`,
    );
  return mime;
}

function dataUrl(file: Blob, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(new DOMException("Envío cancelado", "AbortError"));
    };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("No pudimos leer el archivo."));
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error("No pudimos leer el archivo seleccionado."));
    };
    reader.onabort = cleanup;
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(file);
  });
}

export async function sendChatMessage(
  roomId: string,
  input: OutgoingMessage,
  options: {
    signal?: AbortSignal;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.messageId))
    throw new Error("No pudimos identificar este mensaje.");
  const session = await openChatSession(roomId);
  if (options.signal?.aborted)
    throw new DOMException("Envío cancelado", "AbortError");
  const text =
    input.type === "text"
      ? input.text.replace(/\r\n?/g, "\n").trim()
      : undefined;
  if (input.type === "text" && (!text || text.length > 4000))
    throw new Error("Escribe un mensaje de entre 1 y 4000 caracteres.");
  const preview =
    input.type === "text"
      ? text!
      : input.type === "image"
        ? "📷 Foto"
        : "🎙️ Nota de voz";
  const message: ConsultationMessage = {
    id: input.messageId,
    senderId: session.actor.id,
    senderRole: session.actor.role,
    type: input.type,
    ...(text ? { text } : {}),
    createdAt: new Date().toISOString(),
  };

  if (session.mode === "local") {
    if (input.type !== "text") {
      mediaType(input.file, input.type, true);
      message.mediaUrl = await dataUrl(input.file, options.signal);
    }
    if (options.signal?.aborted)
      throw new DOMException("Envío cancelado", "AbortError");
    await withLocalRoomLock(roomId, () => {
      const current = readLocalConsultation(roomId);
      if (!current) throw new Error("La conversación ya no está disponible.");
      if (current.messages.some((item) => item.id === input.messageId)) return;
      const counter =
        session.actor.role === "cliente" ? "unreadByMaster" : "unreadByClient";
      writeLocalConsultation({
        ...current,
        messages: [...current.messages, message],
        room: {
          ...current.room,
          lastMessage: preview,
          lastMessageAt: message.createdAt,
          lastMessageId: message.id,
          [counter]: current.room[counter] + 1,
        },
      });
    });
    options.onProgress?.(100);
    return;
  }

  const { db, auth } = await getChatBackend();
  const { doc, getDocFromServer, runTransaction, serverTimestamp } =
    await import("firebase/firestore");
  const roomRef = doc(db, "chats", roomId);
  const messageRef = doc(roomRef, "messages", input.messageId);
  if ((await getDocFromServer(messageRef)).exists()) return;
  if (input.type !== "text") {
    const contentType = mediaType(input.file, input.type, false);
    const media = await uploadChatMedia({
      auth,
      file: input.file,
      roomId,
      messageId: input.messageId,
      ownerUid: session.actor.authUid,
      contentType,
      ...options,
    });
    Object.assign(message, media);
  }
  if (options.signal?.aborted)
    throw new DOMException("Envío cancelado", "AbortError");
  await runTransaction(db, async (transaction) => {
    if (auth.currentUser?.uid !== session.actor.authUid)
      throw new Error("Tu sesión cambió. Vuelve a abrir la conversación.");
    if (options.signal?.aborted)
      throw new DOMException("Envío cancelado", "AbortError");
    const roomSnapshot = await transaction.get(roomRef);
    const messageSnapshot = await transaction.get(messageRef);
    if (messageSnapshot.exists()) return;
    const current = roomSnapshot.exists()
      ? parseRoom(roomId, roomSnapshot.data())
      : null;
    if (
      !current ||
      (session.actor.role === "cliente"
        ? current.clientAuthUid !== session.actor.authUid
        : current.masterId !== session.actor.id)
    )
      throw new Error("Tu sesión no tiene acceso a esta sala.");
    const counter =
      session.actor.role === "cliente" ? "unreadByMaster" : "unreadByClient";
    transaction.set(messageRef, { ...message, createdAt: serverTimestamp() });
    transaction.update(roomRef, {
      lastMessage: preview,
      lastMessageAt: serverTimestamp(),
      lastMessageId: input.messageId,
      [counter]: current[counter] + 1,
    });
  });
}

export async function markChatRead(
  roomId: string,
  through: { messageId: string; lastMessageAt: string | null },
): Promise<void> {
  const session = await openChatSession(roomId);
  const counter =
    session.actor.role === "cliente" ? "unreadByClient" : "unreadByMaster";
  const matches = (room: ConsultationRoom) =>
    room.lastMessageId
      ? room.lastMessageId === through.messageId
      : Boolean(
          through.lastMessageAt && room.lastMessageAt === through.lastMessageAt,
        );
  if (session.mode === "local") {
    await withLocalRoomLock(roomId, () => {
      const current = readLocalConsultation(roomId);
      if (current && current.room[counter] > 0 && matches(current.room))
        writeLocalConsultation({
          ...current,
          room: { ...current.room, [counter]: 0 },
        });
    });
    return;
  }
  const { db } = await getChatBackend();
  const { doc, runTransaction } = await import("firebase/firestore");
  const roomRef = doc(db, "chats", roomId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    const room = snapshot.exists() ? parseRoom(roomId, snapshot.data()) : null;
    if (room && room[counter] > 0 && matches(room))
      transaction.update(roomRef, { [counter]: 0 });
  });
}

/** Read-only list, scoped to the current guest; no messages are loaded here. */
export async function listGuestChatRooms(): Promise<ConsultationRoom[]> {
  const guestId = getOrCreateGuestId();
  if (!guestId) return [];
  const rooms = new Map<string, ConsultationRoom>();
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_PREFIX + guestId + "_")) {
      const value = readLocalConsultation(key.slice(STORAGE_PREFIX.length));
      if (value) rooms.set(value.room.id, value.room);
    }
  }
  if (isFirebaseConfigured()) {
    const user = await ensureVisitorUser();
    const { db } = await import("@/lib/firebase");
    const { collection, getDocs, query, where } =
      await import("firebase/firestore");
    const snapshot = await getDocs(
      query(collection(db, "chats"), where("clientAuthUid", "==", user.uid)),
    );
    for (const item of snapshot.docs) {
      const room = parseRoom(item.id, item.data());
      if (room && room.guestId === guestId) rooms.set(room.id, room);
    }
  }
  if (getOrCreateGuestId() !== guestId) return [];
  return [...rooms.values()].sort(
    (a, b) =>
      (b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0) -
      (a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0),
  );
}
