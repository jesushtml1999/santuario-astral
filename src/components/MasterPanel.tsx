"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, MessageCircle, Pencil, Search } from "lucide-react";
import StaffGate from "@/components/StaffGate";
import StaffShell from "@/components/StaffShell";
import ProfileFields, {
  type ProfileFieldValues,
} from "@/components/ProfileFields";
import {
  subscribeMasterInbox,
  subscribeOwnMaster,
  setOwnAvailability,
  saveOwnProfile,
  setChatTag,
} from "@/lib/staffService";
import type { ConsultationRoom } from "@/lib/consultations";
import type { ChatTag, MasterProfile } from "@/types";
import type { StaffSession } from "@/types/staff";

const tags: ChatTag[] = ["Nuevo", "En consulta", "Interesado", "Pagado"];
function OwnProfileEditor({ profile }: { profile: MasterProfile }) {
  const [fields, setFields] = useState<ProfileFieldValues>({
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    specialties: profile.specialties ?? [profile.specialty],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveOwnProfile(fields);
      setNotice("Tu perfil público se ha actualizado.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos actualizar tu perfil.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="own-profile-section">
      <span className="eyebrow">LA ESENCIA DE TU CAMINO</span>
      <h2>Mi perfil público</h2>
      <p>Actualiza tu presentación, tu fotografía y tus especialidades.</p>
      <form className="staff-form" onSubmit={submit}>
        <ProfileFields
          value={fields}
          onChange={setFields}
          onError={setError}
          disabled={busy}
        />
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="staff-success">
            {notice}
          </p>
        )}
        <button className="gold-button" disabled={busy} type="submit">
          {busy && (
            <LoaderCircle size={16} className="spin" aria-hidden="true" />
          )}
          {busy ? "Guardando…" : "Guardar mi perfil"}
        </button>
      </form>
    </section>
  );
}
function Dashboard({ session }: { session: StaffSession }) {
  const masterId = session.masterId ?? "";
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [rooms, setRooms] = useState<ConsultationRoom[] | null>(null);
  const [tab, setTab] = useState<"inbox" | "profile">("inbox");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tagBusy, setTagBusy] = useState("");
  const [shown, setShown] = useState(30);
  useEffect(() => {
    const fail = () => {
      setProfile(null);
      setRooms(null);
      setError(
        "No pudimos cargar tu espacio privado. Revisa tu conexión y tu sesión.",
      );
    };
    const stopProfile = subscribeOwnMaster(masterId, setProfile, fail);
    const stopInbox = subscribeMasterInbox(masterId, setRooms, fail);
    return () => {
      stopProfile();
      stopInbox();
    };
  }, [masterId]);
  const visible = (rooms ?? []).filter(
    (room) =>
      (!filter || room.statusTag === filter) &&
      `${room.clientName} ${room.clientZodiac} ${room.initialTopic ?? ""} ${room.lastMessage}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  async function availability() {
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    try {
      await setOwnAvailability(!profile.isOnline);
    } catch {
      setError("No pudimos actualizar tu disponibilidad.");
    } finally {
      setBusy(false);
    }
  }
  async function tag(roomId: string, next: string) {
    setTagBusy(roomId);
    setError("");
    try {
      await setChatTag(roomId, next as ChatTag);
    } catch {
      setError("No pudimos cambiar la etiqueta de esta conversación.");
    } finally {
      setTagBusy("");
    }
  }
  return (
    <StaffShell session={session}>
      <section className="staff-page-heading">
        <div>
          <span className="eyebrow">
            CADA CONVERSACIÓN TIENE SU PROPIO CAMINO
          </span>
          <h1>{profile?.name ?? session.displayName}</h1>
          <p>Tu bandeja, tus encuentros y tu espacio para acompañar.</p>
        </div>
        <div className="availability-control">
          <span>Mi disponibilidad</span>
          <button
            role="switch"
            aria-label="Cambiar mi disponibilidad"
            aria-checked={profile?.isOnline ?? false}
            onClick={() => {
              void availability();
            }}
            disabled={!profile || busy}
            className={profile?.isOnline ? "is-online" : ""}
          >
            <span aria-hidden="true" />
            {busy
              ? "Actualizando…"
              : profile?.isOnline
                ? "En línea"
                : "Ocupado / Desconectado"}
          </button>
        </div>
      </section>
      {profile && !profile.isActive && (
        <p className="staff-muted-notice">
          Tu perfil está oculto en el catálogo. El administrador puede volver a
          hacerlo visible.
        </p>
      )}
      <div className="staff-tabs" role="group" aria-label="Secciones del panel">
        <button aria-pressed={tab === "inbox"} onClick={() => setTab("inbox")}>
          <MessageCircle size={17} aria-hidden="true" />
          Bandeja de chats
          {rooms &&
            rooms.reduce((sum, room) => sum + room.unreadByMaster, 0) > 0 && (
              <span>
                {rooms.reduce((sum, room) => sum + room.unreadByMaster, 0)}
              </span>
            )}
        </button>
        <button
          aria-pressed={tab === "profile"}
          onClick={() => setTab("profile")}
        >
          <Pencil size={16} aria-hidden="true" />
          Mi perfil
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {tab === "profile" ? (
        profile && <OwnProfileEditor key={profile.id} profile={profile} />
      ) : (
        <>
          <div className="inbox-toolbar">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Buscar en mis conversaciones</span>
              <input
                type="search"
                value={search}
                placeholder="Busca un cliente o un motivo…"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="tag-filter">
              <span className="sr-only">Filtrar por etiqueta</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="">Todas las etiquetas</option>
                {tags.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          {!rooms && !error ? (
            <p role="status">Abriendo tu bandeja…</p>
          ) : visible.length ? (
            <div className="staff-inbox">
              {visible.slice(0, shown).map((room) => (
                <article className="staff-chat-row" key={room.id}>
                  <Link
                    href={`/chat/${encodeURIComponent(room.id)}`}
                    className="staff-chat-main"
                  >
                    <div className="client-monogram" aria-hidden="true">
                      {room.clientName.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <h2>
                        {room.clientName}
                        {room.unreadByMaster > 0 && (
                          <span
                            className="unread-badge"
                            aria-label={`${room.unreadByMaster} mensajes sin leer`}
                          >
                            {room.unreadByMaster}
                          </span>
                        )}
                      </h2>
                      <span>
                        {room.clientZodiac ||
                          room.initialTopic ||
                          "Consulta sin signo indicado"}
                      </span>
                      <p>{room.lastMessage}</p>
                    </div>
                  </Link>
                  <label className="chat-tag-editor">
                    <span>Etiqueta</span>
                    <select
                      aria-label={`Etiqueta de la conversación con ${room.clientName}`}
                      value={room.statusTag}
                      disabled={tagBusy === room.id}
                      onChange={(event) => {
                        void tag(room.id, event.target.value);
                      }}
                    >
                      {tags.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <MessageCircle size={32} aria-hidden="true" />
              <h2>
                {rooms?.length
                  ? "No hay coincidencias"
                  : "Tu espacio está listo"}
              </h2>
              <p>
                {rooms?.length
                  ? "Prueba otro nombre o etiqueta."
                  : "Las consultas dirigidas a tu perfil aparecerán aquí."}
              </p>
            </div>
          )}
          {visible.length > shown && (
            <button
              className="outline-button load-more-staff"
              onClick={() => setShown((value) => value + 30)}
            >
              Ver más conversaciones
            </button>
          )}
        </>
      )}
    </StaffShell>
  );
}
export default function MasterPanel() {
  return (
    <StaffGate role="maestro">
      {(session) => <Dashboard key={session.uid} session={session} />}
    </StaffGate>
  );
}
