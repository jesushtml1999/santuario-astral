import type { ClientLeadData } from "@/types";

const GUEST_ID_KEY = "santuario-astral:guest-id";
const GUEST_LEAD_KEY = "santuario-astral:guest-lead";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Browser-only fallbacks for blocked storage; they do not survive a page reload.
let memoryGuestId: string | null = null;
let memoryLeadData: ClientLeadData | null = null;
let hasUnpersistedLead = false;

function readStoredValue(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function parseLeadData(value: unknown): ClientLeadData | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const data = value as Record<string, unknown>;

  if (
    typeof data.guestId !== "string" ||
    !UUID_PATTERN.test(data.guestId) ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    typeof data.initialTopic !== "string" ||
    !data.initialTopic.trim() ||
    (data.birthDateOrSign !== undefined &&
      typeof data.birthDateOrSign !== "string")
  ) {
    return null;
  }

  const lead: ClientLeadData = {
    guestId: data.guestId,
    name: data.name.trim(),
    initialTopic: data.initialTopic.trim(),
  };

  if (typeof data.birthDateOrSign === "string" && data.birthDateOrSign.trim()) {
    lead.birthDateOrSign = data.birthDateOrSign.trim();
  }

  return lead;
}

/** Returns null on the server. Call from a browser event or useEffect. */
export function getOrCreateGuestId(): string | null {
  if (typeof window === "undefined") return null;

  const storedId = readStoredValue(GUEST_ID_KEY);

  if (storedId && UUID_PATTERN.test(storedId)) {
    memoryGuestId = storedId;
    return storedId;
  }

  // This ID groups local chats; it is not Firebase authentication or authorization.
  memoryGuestId ??= window.crypto.randomUUID();
  writeStoredValue(GUEST_ID_KEY, memoryGuestId);

  return memoryGuestId;
}

/** Returns true if persisted, or false for SSR or an in-memory-only save. */
export function saveGuestLeadData(data: ClientLeadData): boolean {
  const guestId = getOrCreateGuestId();
  if (!guestId) return false;

  const lead = parseLeadData(data);

  if (!lead || lead.guestId !== guestId) {
    throw new TypeError(
      "Los datos del cliente deben ser válidos y pertenecer al invitado actual.",
    );
  }

  memoryLeadData = lead;
  const persisted = writeStoredValue(GUEST_LEAD_KEY, JSON.stringify(lead));
  hasUnpersistedLead = !persisted;
  return persisted;
}

/** Ignores corrupt data and leads belonging to a different guest. */
export function getGuestLeadData(): ClientLeadData | null {
  const guestId = getOrCreateGuestId();
  if (!guestId) return null;

  if (hasUnpersistedLead && memoryLeadData?.guestId === guestId) {
    return { ...memoryLeadData };
  }

  const serializedLead = readStoredValue(GUEST_LEAD_KEY);

  if (serializedLead === null) {
    return memoryLeadData?.guestId === guestId ? { ...memoryLeadData } : null;
  }

  try {
    const value: unknown = JSON.parse(serializedLead);
    const lead = parseLeadData(value);

    if (!lead || lead.guestId !== guestId) return null;

    memoryLeadData = lead;
    return { ...lead };
  } catch {
    return null;
  }
}
