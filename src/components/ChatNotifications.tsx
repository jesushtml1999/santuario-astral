"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useReducer, useRef } from "react";
import { Bell, Volume2, VolumeX, X } from "lucide-react";
import { useStaffSession } from "@/hooks/useStaffSession";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { subscribeChatInbox } from "@/lib/chatInbox";
import {
  claimNotificationSound,
  createInboxTracker,
  getNotifications,
  subscribeNotifications,
  unreadMessages,
  updateNotifications,
} from "@/lib/chatNotifications";
import { createNotificationSound } from "@/lib/notificationSound";

export default function ChatNotifications() {
  const { session, loading, error: sessionError } = useStaffSession();
  const state = useChatNotifications();
  const pathname = usePathname();
  const [attempt, retry] = useReducer(value => value + 1, 0);
  const audio = useRef<ReturnType<typeof createNotificationSound> | null>(null);
  const hiddenMessages = useRef(0);
  const uid = session?.uid;
  const role = session?.role;
  const mode = session?.mode;
  const masterId = session?.masterId;

  useEffect(() => {
    const sound = createNotificationSound(status => updateNotifications({ sound: status }));
    audio.current = sound;
    const unlock = (event: Event) => {
      // The explicit toggle must not activate on pointerdown and mute on click.
      if ((event.target as HTMLElement | null)?.closest?.("[data-chat-sound-control]")) return;
      const status = getNotifications().sound;
      if (status === "locked") void sound.enable(true);
    };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      audio.current = null;
      sound.dispose();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let failed = false;
    hiddenMessages.current = 0;
    updateNotifications({ role: null, rooms: [], loaded: !loading, error: "", notice: null });
    if (loading || sessionError || role === "admin") return;
    const tracker = createInboxTracker((notice, owner) => {
      if (!active || failed) return;
      if (document.visibilityState === "hidden") hiddenMessages.current++;
      updateNotifications({ notice });
      if (getNotifications().sound === "enabled")
        void claimNotificationSound(owner, notice.token).then(claimed => {
          if (active && !failed && claimed && getNotifications().sound === "enabled")
            audio.current?.play(role === "maestro" ? "maestro" : "cliente");
        });
    });
    // Only identity fields restart the listener; changing names or routes does not.
    const actor = uid && role && mode ? {
      uid, role, mode, masterId, displayName: "", email: "",
    } : null;
    const stop = subscribeChatInbox(actor, snapshot => {
      if (!active || failed) return;
      updateNotifications({ role: snapshot.role, rooms: snapshot.rooms, loaded: snapshot.confirmed || snapshot.rooms.length > 0, error: "" });
      tracker.accept(snapshot);
    }, () => {
      failed = true;
      hiddenMessages.current = 0;
      tracker.stop();
      updateNotifications({ role: role === "maestro" ? "maestro" : "cliente", rooms: [], loaded: true,
        notice: null, error: "No pudimos actualizar los avisos. Revisa tu conexión y tu sesión." });
    });
    return () => {
      active = false;
      tracker.stop();
      stop();
      updateNotifications({ role: null, rooms: [], loaded: false, notice: null, error: "" });
    };
  }, [uid, role, mode, masterId, loading, sessionError, attempt]);

  useEffect(() => {
    let baseTitle = document.title;
    const prefix = /^\(\d+\) Mensajes sin leer · /;
    const restore = () => {
      if (prefix.test(document.title)) document.title = baseTitle;
    };
    const refresh = () => {
      if (!prefix.test(document.title)) baseTitle = document.title;
      if (document.visibilityState === "visible") {
        hiddenMessages.current = 0;
        restore();
      } else {
        const count = Math.max(unreadMessages(getNotifications()), hiddenMessages.current);
        if (count) document.title = `(${count}) Mensajes sin leer · ${baseTitle}`;
        else restore();
      }
    };
    const stop = subscribeNotifications(refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", refresh);
      restore();
    };
  }, [pathname]);

  const noticeToken = state.notice?.token;
  useEffect(() => {
    if (!noticeToken) return;
    const timer = window.setTimeout(() => {
      if (getNotifications().notice?.token === noticeToken) updateNotifications({ notice: null });
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [noticeToken]);

  if (!state.role || (state.role === "cliente" && !state.rooms.length && !state.error && !state.notice)) return null;
  const unread = unreadMessages(state);
  const enabled = state.sound === "enabled";
  const inbox = state.role === "maestro" ? "/maestro/panel" : "/catalogo?vista=chats";
  return (
    <aside className={`chat-notification-center ${pathname.startsWith("/chat/") ? "in-chat" : ""} ${state.role === "maestro" ? "for-master" : ""}`} aria-label="Avisos de chat">
      {state.notice && (
        <div className="chat-notification-toast" role="status" aria-live="polite" aria-atomic="true">
          <div>
            <strong>Nuevo mensaje de {state.notice.senderName}</strong>
            <Link href={`/chat/${encodeURIComponent(state.notice.roomId)}`} onClick={() => updateNotifications({ notice: null })}>Abrir chat</Link>
          </div>
          <button aria-label="Cerrar aviso" onClick={() => updateNotifications({ notice: null })}><X size={16} aria-hidden="true" /></button>
        </div>
      )}
      <div className="chat-notification-controls">
        <Link href={inbox} className="notification-inbox-link" aria-label={`Mensajes: ${unread} sin leer`}>
          <Bell size={17} aria-hidden="true" />
          {unread > 0 && <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>}
        </Link>
        {state.error ? (
          <button onClick={retry} title={state.error}>Reintentar avisos</button>
        ) : (
          <button
            data-chat-sound-control
            disabled={state.sound === "unsupported"}
            aria-label={enabled ? "Silenciar avisos de chat" : "Activar sonido de mensajes"}
            aria-pressed={enabled}
            onClick={() => { if (enabled) audio.current?.mute(); else void audio.current?.enable(); }}
          >
            {enabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            {enabled ? "Sonido activado" : state.sound === "unsupported" ? "Avisos visuales" : "Activar sonido"}
          </button>
        )}
      </div>
    </aside>
  );
}
