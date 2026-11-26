import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";
import { ensureVisitorUser } from "@/lib/chatIdentity";
import { getOrCreateGuestId } from "@/lib/guestSession";
import { requireStaff } from "@/lib/staffAuth";
import {
  CHAT_CHANGED,
  STORAGE_PREFIX,
  parseMessage,
  parseRoom,
  readLocalConsultation,
  type ConsultationMessage,
  type ConsultationRoom,
} from "@/lib/consultations";
import type { StaffSession } from "@/types/staff";

export interface InboxSnapshot {
  owner: string;
  role: "cliente" | "maestro";
  rooms: ConsultationRoom[];
  /** Only a committed server snapshot (or local mode) establishes a baseline. */
  confirmed: boolean;
  readMessage: (room: ConsultationRoom) => Promise<ConsultationMessage | null>;
}

/** One participant-scoped query, not one listener per conversation. */
export function subscribeChatInbox(
  staff: StaffSession | null,
  next: (snapshot: InboxSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  const stops: Array<() => void> = [];
  const stop = () => {
    active = false;
    stops.splice(0).forEach(cleanup => cleanup());
  };
  const fail = (error: unknown) => {
    if (!active) return;
    stop();
    onError(error);
  };
  void (async () => {
    if (staff?.role === "admin") return;
    const role = staff ? "maestro" : "cliente";
    const guestId = staff ? null : getOrCreateGuestId();
    const masterId = staff?.masterId;
    if (staff) {
      if (!masterId) throw new Error("No pudimos identificar al maestro.");
      const verified = await requireStaff("maestro");
      if (verified.uid !== staff.uid || verified.masterId !== masterId)
        throw new Error("Tu sesión cambió. Vuelve a iniciar sesión.");
    }
    if (!active) return;
    if (!staff && !guestId) throw new Error("No pudimos identificar tu sesión.");
    const cloud = staff ? staff.mode === "firebase" : isFirebaseConfigured();
    const backend = cloud
      ? staff
        ? await import("@/lib/staffFirebase").then(({ staffAuth, staffDb }) => ({ auth: staffAuth, db: staffDb }))
        : await ensureVisitorUser().then(() => import("@/lib/firebase"))
      : null;
    if (!active) return;
    const uid = backend?.auth.currentUser?.uid ?? "";
    if (cloud && (!uid || (staff && uid !== staff.uid))) throw new Error("Vuelve a abrir tu sesión.");
    const owner = `${role}:${staff?.mode ?? (cloud ? "firebase" : "local")}:${uid || staff?.uid || guestId}`;
    const owns = (room: ConsultationRoom) => role === "maestro"
      ? room.masterId === masterId
      : room.guestId === guestId;
    const stillOwns = () => active &&
      (staff || getOrCreateGuestId() === guestId) &&
      (!backend || backend.auth.currentUser?.uid === uid);
    const local = new Map<string, ConsultationRoom>();
    let remote: ConsultationRoom[] = [];
    let confirmed = !cloud;
    const readMessage = async (room: ConsultationRoom) => {
      if (!stillOwns() || !owns(room)) return null;
      let message: ConsultationMessage | null = null;
      if (local.has(room.id)) {
        const record = readLocalConsultation(room.id);
        message = record?.messages.find(item => item.id === room.lastMessageId) ?? null;
      } else if (backend && room.lastMessageId && /^[\w-]{1,128}$/.test(room.lastMessageId)) {
        const { doc, getDocFromServer } = await import("firebase/firestore");
        const result = await getDocFromServer(doc(backend.db, "chats", room.id, "messages", room.lastMessageId));
        message = result.exists() ? parseMessage(result.data()) : null;
      }
      return stillOwns() ? message : null;
    };
    const emit = () => {
      if (!stillOwns()) return fail(new Error("Tu sesión cambió."));
      const combined = new Map(local);
      for (const room of remote) combined.set(room.id, room);
      next({ owner, role, confirmed, readMessage, rooms: [...combined.values()].sort(
        (a, b) => Date.parse(b.lastMessageAt ?? "") - Date.parse(a.lastMessageAt ?? ""),
      ) });
    };
    const refresh = () => {
      if (!active) return;
      try {
        local.clear();
        for (let index = 0; index < window.localStorage.length; index++) {
          const key = window.localStorage.key(index);
          if (!key?.startsWith(STORAGE_PREFIX)) continue;
          const id = key.slice(STORAGE_PREFIX.length);
          if (role === "maestro" ? id.slice(37) !== masterId : !id.startsWith(`${guestId}_`)) continue;
          const record = readLocalConsultation(id);
          if (record && owns(record.room) && (!cloud || record.isDemo))
            local.set(id, record.room);
        }
      } catch {
        // Blocked local storage must not stop real Firestore notifications.
        local.clear();
      }
      emit();
    };
    for (const event of [CHAT_CHANGED, "storage", "focus"]) {
      window.addEventListener(event, refresh);
      stops.push(() => window.removeEventListener(event, refresh));
    }
    refresh();
    if (!backend || !active) return;
    const { onAuthStateChanged } = await import("firebase/auth");
    if (!active) return;
    stops.push(onAuthStateChanged(backend.auth, user => {
      if (user?.uid !== uid) fail(new Error("Tu sesión cambió."));
    }));
    const { collection, query, where, onSnapshot } = await import("firebase/firestore");
    if (!active) return;
    stops.push(onSnapshot(
      query(collection(backend.db, "chats"), where(role === "maestro" ? "masterId" : "clientAuthUid", "==", role === "maestro" ? masterId : uid)),
      { includeMetadataChanges: true },
      snapshot => {
        if (!active) return;
        const parsed = snapshot.docs.map(item => parseRoom(item.id, item.data()));
        if (parsed.some(room => !room || (role === "maestro" ? !owns(room) : room.clientAuthUid !== uid)))
          return fail(new Error("La bandeja no pertenece a tu sesión."));
        remote = parsed.filter((room): room is ConsultationRoom => room !== null && owns(room));
        confirmed = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
        emit();
      }, fail,
    ));
  })().catch(fail);
  return stop;
}
