"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import CountryFlag from "@/components/CountryFlag";
import { useMasters } from "@/hooks/useMasters";

export default function GuestChats() {
  const catalog = useMasters();
  const notifications = useChatNotifications();
  const result = notifications.loaded ? {
    rooms: notifications.role === "cliente" ? notifications.rooms : [],
    error: notifications.error,
  } : null;
  return (
    <section className="guest-chats-section">
      <span className="eyebrow">TUS CONVERSACIONES</span>
      <h1>Mis Chats</h1>
      <p className="guest-chats-intro">
        Vuelve a tu espacio con cada guía, sin perder el hilo de tu camino.
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
          <h2>Tu próxima conexión empieza aquí</h2>
          <p>
            Elige un maestro e inicia una consulta para encontrar su
            conversación en este espacio.
          </p>
          <Link href="/catalogo" className="gold-button">
            Explorar guías
          </Link>
        </div>
      )}
    </section>
  );
}
