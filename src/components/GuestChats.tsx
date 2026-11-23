"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { chatErrorMessage, listGuestChatRooms } from "@/lib/chatService";
import { CHAT_CHANGED, type ConsultationRoom } from "@/lib/consultations";
import CountryFlag from "@/components/CountryFlag";
import { useMasters } from "@/hooks/useMasters";

export default function GuestChats() {
  const catalog = useMasters();
  const [result, setResult] = useState<{
    rooms: ConsultationRoom[];
    error: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      void listGuestChatRooms().then(
        (rooms) => {
          if (active && current === request) setResult({ rooms, error: "" });
        },
        (error: unknown) => {
          if (active && current === request)
            setResult({ rooms: [], error: chatErrorMessage(error) });
        },
      );
    };
    refresh();
    window.addEventListener(CHAT_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener(CHAT_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return (
    <section className="guest-chats-section">
      <span className="eyebrow">TUS CONVERSACIONES</span>
      <h1>Mis Chats</h1>
      <p className="guest-chats-intro">
        Aquí puedes continuar tus conversaciones.
      </p>
      {!result ? (
        <p role="status">Buscando tus conversaciones…</p>
      ) : result.error ? (
        <p role="alert" className="form-error">
          {result.error}
        </p>
      ) : result.rooms.length ? (
        <div className="guest-chat-list">
          {result.rooms.map((room) => (
            <Link
              key={room.id}
              href={`/chat/${encodeURIComponent(room.id)}`}
              className="guest-chat-link"
            >
              <MessageCircle size={23} aria-hidden="true" />
              <span>
                <strong>
                  {room.masterName}{" "}
                  <CountryFlag
                    code={
                      catalog.masters.find(
                        (master) => master.id === room.masterId,
                      )?.countryCode
                    }
                  />
                </strong>
                <span>{room.lastMessage}</span>
              </span>
              {room.unreadByClient > 0 && (
                <span
                  className="unread-badge"
                  aria-label={`${room.unreadByClient} mensajes sin leer`}
                >
                  {room.unreadByClient}
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <MessageCircle size={34} aria-hidden="true" />
          <h2>Aún no tienes conversaciones</h2>
          <p>Cuando escribas a un maestro, su chat aparecerá aquí.</p>
          <Link href="/catalogo" className="gold-button">
            Ver maestros
          </Link>
        </div>
      )}
    </section>
  );
}
