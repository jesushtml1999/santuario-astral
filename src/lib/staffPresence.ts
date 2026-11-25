import { PRESENCE_HEARTBEAT_MS, PresenceError, nextPresence, type PresenceCommand } from "@/lib/presence";
import type { StaffSession } from "@/types/staff";

type Transport = (command: PresenceCommand, leaving: boolean) => Promise<unknown>;
let active: { uid: string; close: () => Promise<void>; availability: (online: boolean) => Promise<void> } | null = null;

function transportFor(session: StaffSession): Transport {
  let token = "";
  return async (command, leaving) => {
    if (session.mode === "local") {
      const { readLocalMasters, writeLocalMasters, withDirectoryLock } = await import("@/lib/localMasters");
      return withDirectoryLock(() => {
        const key = `santuario-astral:presence:${session.masterId}`;
        let previous: unknown;
        try { previous = JSON.parse(window.localStorage.getItem(key) ?? "null"); } catch { previous = null; }
        const result = nextPresence(previous, command, Date.now());
        window.localStorage.setItem(key, JSON.stringify(result.state));
        writeLocalMasters(readLocalMasters().map((profile) => profile.id === session.masterId
          ? { ...profile, isOnline: result.isOnline && profile.isActive, presenceExpiresAt: result.expiresAt }
          : profile));
        return result;
      });
    }
    if (!leaving || !token) {
      const { staffAuth } = await import("@/lib/staffFirebase");
      if (staffAuth.currentUser?.uid !== session.uid) throw new Error("Tu sesión cambió.");
      token = await staffAuth.currentUser.getIdToken();
    }
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 12_000);
    try {
      const response = await fetch("/api/staff/presence", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(command), keepalive: leaving, signal: abort.signal,
      });
      if (!response.ok) throw new PresenceError("No pudimos actualizar tu conexión.", response.status);
    } finally { clearTimeout(timeout); }
  };
}

/** One lease per tab, shared by every staff route; never replaces another tab's lease. */
export function startMasterPresence(session: StaffSession, send = transportFor(session)): () => void {
  if (session.role !== "maestro" || !session.masterId) return () => {};
  void active?.close();
  let stopped = false;
  let connectionId: string | null = null;
  let ready = false;
  let connecting: Promise<void> | null = null;
  const disconnect = async () => {
    const previous = connectionId;
    connectionId = null;
    connecting = null;
    ready = false;
    if (previous) {
      try { await send({ action: "disconnect", connectionId: previous }, true); }
      catch { /* Expiry is the fallback when the network/browser cannot deliver this. */ }
    }
  };
  const ensureConnected = async () => {
    if (stopped || window.navigator.onLine === false) return;
    if (ready) return;
    if (connecting) return connecting;
    const id = connectionId ?? window.crypto.randomUUID();
    connectionId = id;
    const job = send({ action: "connect", connectionId: id }, false).then(() => {
      if (!stopped && connectionId === id) ready = true;
    }).finally(() => { if (connectionId === id) connecting = null; });
    connecting = job;
    return job;
  };
  const heartbeat = async () => {
    if (stopped || window.navigator.onLine === false) return;
    let attemptedId = connectionId;
    try {
      if (!ready) {
        const pending = ensureConnected();
        attemptedId = connectionId;
        await pending;
        return;
      }
      const id = connectionId;
      if (id) await send({ action: "heartbeat", connectionId: id }, false);
    } catch (cause) {
      if (cause instanceof PresenceError && cause.status === 409 && connectionId === attemptedId) {
        connectionId = null;
        ready = false;
        try { await ensureConnected(); } catch { /* Retry at the next interval. */ }
      }
      // A failed request never claims a fresh lease. Retry on the next heartbeat.
    }
  };
  const refresh = () => { void heartbeat(); };
  const hide = () => { void disconnect(); };
  const visible = () => { if (document.visibilityState === "visible") refresh(); };
  const timer = setInterval(refresh, PRESENCE_HEARTBEAT_MS);
  window.addEventListener("online", refresh);
  window.addEventListener("offline", hide);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", visible);
  const controller = {
    uid: session.uid,
    availability: async (online: boolean) => {
      await ensureConnected();
      if (!connectionId || stopped || !ready) throw new Error("Revisa tu conexión e inténtalo de nuevo.");
      await send({ action: "availability", connectionId, available: online }, false);
    },
    close: async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
      if (active === controller) active = null;
      await disconnect();
    },
  };
  active = controller;
  refresh();
  return () => { void controller.close(); };
}

export async function stopMasterPresence() { await active?.close(); }
export function hasActiveMasterPresence(uid: string) { return active?.uid === uid; }
export async function setMasterPresenceAvailability(session: StaffSession, online: boolean) {
  if (!active || active.uid !== session.uid) startMasterPresence(session);
  await active?.availability(online);
}
