import type { InboxSnapshot } from "@/lib/chatInbox";
import type { ConsultationRoom } from "@/lib/consultations";

export interface IncomingNotice {
  token: string;
  roomId: string;
  senderName: string;
}
export interface NotificationState {
  role: "cliente" | "maestro" | null;
  rooms: ConsultationRoom[];
  loaded: boolean;
  error: string;
  notice: IncomingNotice | null;
  sound: "locked" | "enabled" | "muted" | "unsupported";
}
export const initialNotifications: NotificationState = {
  role: null, rooms: [], loaded: false, error: "", notice: null, sound: "locked",
};
let state = initialNotifications;
const listeners = new Set<() => void>();
export const getNotifications = () => state;
export const getServerNotifications = () => initialNotifications;
export function subscribeNotifications(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function updateNotifications(patch: Partial<NotificationState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}
export function unreadMessages(value: NotificationState): number {
  return value.rooms.reduce((sum, room) => sum + (value.role === "maestro" ? room.unreadByMaster : room.unreadByClient), 0);
}

/** Initial cache/server history, reads and own messages never generate alerts. */
export function createInboxTracker(incoming: (notice: IncomingNotice, owner: string) => void) {
  let owner = "";
  let role = "";
  let initialized = false;
  let active = true;
  const versions = new Map<string, string | undefined>();
  const announced = new Set<string>();
  return {
    accept(snapshot: InboxSnapshot) {
      if (!active || !snapshot.confirmed) return;
      if (snapshot.owner !== owner) {
        owner = snapshot.owner;
        role = snapshot.role;
        initialized = false;
        versions.clear();
        announced.clear();
      }
      for (const room of snapshot.rooms) {
        const previous = versions.get(room.id);
        versions.set(room.id, room.lastMessageId);
        if (!initialized || !room.lastMessageId || previous === room.lastMessageId) continue;
        const token = `${room.id}:${room.lastMessageId}`;
        if (announced.has(token)) continue;
        announced.add(token);
        if (announced.size > 1000) announced.delete(announced.values().next().value!);
        const currentOwner = owner;
        void snapshot.readMessage(room).then(message => {
          if (!active || owner !== currentOwner || !message || message.id !== room.lastMessageId || message.senderRole === role) return;
          const expectedSender = message.senderRole === "cliente" ? room.guestId : room.masterId;
          if (message.senderId !== expectedSender) return;
          incoming({ token, roomId: room.id, senderName: role === "maestro" ? room.clientName : room.masterName }, owner);
        }).catch(() => {
          // The unread badge still works if the optional sender verification fails.
        });
      }
      initialized = true;
    },
    stop() { active = false; },
  };
}

const soundClaims = new Set<string>();
/** Coordinate audio across tabs; store only opaque event IDs, never chat text. */
export async function claimNotificationSound(owner: string, token: string): Promise<boolean> {
  const key = `santuario-astral:notification-sounds:${owner}`;
  const claim = () => {
    const localKey = `${key}:${token}`;
    if (soundClaims.has(localKey)) return false;
    soundClaims.add(localKey);
    if (soundClaims.size > 1000) soundClaims.delete(soundClaims.values().next().value!);
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      const records = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
      if (records.includes(token)) return false;
      window.localStorage.setItem(key, JSON.stringify([...records.slice(-127), token]));
    } catch { /* Denied storage degrades to per-tab deduplication. */ }
    return true;
  };
  try {
    if (navigator.locks) return await navigator.locks.request(key, claim);
  } catch { /* Web Locks may be unavailable or denied. */ }
  return claim();
}
