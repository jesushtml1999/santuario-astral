export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_LEASE_MS = 90_000;
export const PRESENCE_CONNECTION_LIMIT = 64;

export type PresenceAction = "connect" | "heartbeat" | "disconnect" | "availability";
export interface PresenceCommand {
  action: PresenceAction;
  connectionId: string;
  available?: boolean;
}
export interface PresenceConnection { expiresAt: number; connected: boolean }
export interface PresenceState {
  available: boolean;
  connections: Record<string, PresenceConnection>;
}
export class PresenceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function presenceCommand(value: unknown): PresenceCommand {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PresenceError("Solicitud de conexión no válida.", 400);
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["action", "connectionId", "available"].includes(key))
    || !["connect", "heartbeat", "disconnect", "availability"].includes(String(data.action))
    || typeof data.connectionId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.connectionId)
    || (data.action === "availability" ? typeof data.available !== "boolean" : data.available !== undefined))
    throw new PresenceError("Solicitud de conexión no válida.", 400);
  return data as unknown as PresenceCommand;
}

export function nextPresence(previous: unknown, command: PresenceCommand, now: number) {
  const old = previous && typeof previous === "object" ? previous as Partial<PresenceState> : {};
  const connections: Record<string, PresenceConnection> = {};
  for (const [id, value] of Object.entries(old.connections ?? {})) {
    if (value && Number.isFinite(value.expiresAt) && value.expiresAt > now
      && typeof value.connected === "boolean") connections[id] = { ...value };
  }
  const current = connections[command.connectionId];
  let available = old.available !== false;
  if (command.action === "disconnect") {
    // A short-lived tombstone prevents an in-flight heartbeat/connect from
    // resurrecting a tab that has already logged out.
    connections[command.connectionId] = { connected: false, expiresAt: now + PRESENCE_LEASE_MS };
  } else {
    if (current?.connected === false || (command.action !== "connect" && !current))
      throw new PresenceError("La conexión ha caducado.", 409);
    connections[command.connectionId] = { connected: true, expiresAt: now + PRESENCE_LEASE_MS };
    if (command.action === "connect") available = true;
    if (command.action === "availability") available = command.available === true;
  }
  if (Object.keys(connections).length > PRESENCE_CONNECTION_LIMIT)
    throw new PresenceError("Hay demasiadas sesiones abiertas. Cierra alguna e inténtalo de nuevo.", 429);
  const expiresAt = Math.max(0, ...Object.values(connections)
    .filter((value) => value.connected).map((value) => value.expiresAt));
  return { state: { available, connections }, expiresAt, isOnline: available && expiresAt > now };
}

export function presenceExpiry(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    try { return presenceExpiry(value.toMillis()); } catch { return undefined; }
  }
  return undefined;
}

export function masterIsOnline(
  profile: { isOnline: boolean; isActive?: boolean; presenceExpiresAt?: number },
  requireLease = true,
  now = Date.now(),
): boolean {
  return profile.isOnline && profile.isActive !== false
    && (profile.presenceExpiresAt === undefined
      ? !requireLease
      : profile.presenceExpiresAt > now);
}

/** Recompute once at expiry; it works even when no new Firestore write arrives. */
export function onPresenceExpiry(expiresAt: number | undefined, refresh: () => void): () => void {
  if (!expiresAt || expiresAt <= Date.now()) return () => {};
  const timer = setTimeout(refresh, Math.min(expiresAt - Date.now() + 25, 2_147_483_647));
  return () => clearTimeout(timer);
}
