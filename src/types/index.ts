import type { Timestamp } from "firebase/firestore";

export type UserRole = "cliente" | "maestro" | "admin";

/** Stored in users/{masterId}; never merge this into a public MasterProfile. */
export interface MasterPrivateContact {
  phone: string;
}

export interface MasterProfile {
  specialties?: string[];
  isTestProfile?: boolean;
  id: string;
  name: string;
  /** Public ISO 3166-1 alpha-2 code, or empty when unassigned. */
  countryCode: string;
  avatarUrl: string;
  /** For example: Tarot, Amor, Limpias, Astrología or Numerología. */
  specialty: string;
  bio: string;
  experienceYears: number;
  rating: number;
  reviewsCount: number;
  isOnline: boolean;
  /** Server-issued connection lease, normalized to epoch milliseconds. */
  presenceExpiresAt?: number;
  isActive: boolean;
}

export interface ClientLeadData {
  guestId: string;
  name: string;
  birthDateOrSign?: string;
  initialTopic: string;
}

export type ChatTag = "Nuevo" | "En consulta" | "Interesado" | "Pagado";

export interface ChatRoom {
  /** Firebase identity bound when a cloud room is created. Never inferred from a URL. */
  clientAuthUid?: string;
  initialTopic?: string;
  lastMessageId?: string;
  /** Construct using `${guestId}_${masterId}`. */
  id: `${string}_${string}`;
  guestId: string;
  masterId: string;
  clientName: string;
  clientZodiac: string;
  masterName: string;
  masterAvatar: string;
  lastMessage: string;
  /** Null while a Firestore server timestamp is pending. */
  lastMessageAt: Timestamp | null;
  unreadByMaster: number;
  unreadByClient: number;
  statusTag: ChatTag;
}

export interface ChatMessage {
  storagePath?: string;
  id: string;
  senderId: string;
  senderRole: Extract<UserRole, "cliente" | "maestro">;
  type: "text" | "image" | "audio";
  text?: string;
  mediaUrl?: string;
  /** Null while a Firestore server timestamp is pending. */
  createdAt: Timestamp | null;
}
