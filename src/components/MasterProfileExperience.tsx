"use client";
import CountryFlag from "@/components/CountryFlag";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeft,
  Heart,
  LoaderCircle,
  MessageCircle,
  Moon,
  Sparkles,
  Star,
} from "lucide-react";
import BrandHeader from "@/components/BrandHeader";
import BottomNav from "@/components/BottomNav";
import AstralModal from "@/components/AstralModal";
import ConsultationIntakeModal from "@/components/ConsultationIntakeModal";
import { useMasters } from "@/hooks/useMasters";
import { useFavorites } from "@/hooks/useFavorites";
import { safeAvatarUrl } from "@/lib/masters";
import { consultationRoomId, getConsultation } from "@/lib/consultations";
import { getOrCreateGuestId } from "@/lib/guestSession";
import { trackViewMaster } from "@/lib/metaPixel";

export default function MasterProfileExperience() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { masters, isDemo, isLoading } = useMasters();
  const { favorites, toggleFavorite } = useFavorites();
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [existingRoomId, setExistingRoomId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const master = masters.find((item) => item.id === id);
  const isExample = isDemo || master?.isTestProfile === true;
  const avatar = master ? safeAvatarUrl(master.avatarUrl) : "";
  useEffect(() => {
    if (master && !isLoading)
      trackViewMaster(master.id, master.name, master.specialty);
  }, [master, isLoading]);

  async function beginConsultation() {
    if (!master || checking || isLoading) return;
    setChecking(true);
    setError("");
    try {
      const guestId = getOrCreateGuestId();
      if (!guestId) throw new Error("Abre tu consulta desde el navegador.");
      const roomId = consultationRoomId(guestId, master.id);
      const previous = await getConsultation(roomId, isDemo);
      if (previous) setExistingRoomId(roomId);
      else setIntakeOpen(true);
    } catch {
      setError(
        "No pudimos revisar tus conversaciones. Comprueba tu conexión y que el navegador permita guardar datos e inténtalo de nuevo.",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="astral-shell profile-shell">
      <div className="page-container">
        <BrandHeader />
        <main id="contenido" className="profile-main">
          <Link href="/catalogo" className="back-link">
            <ArrowLeft size={16} aria-hidden="true" /> Volver al catálogo
          </Link>
          {!master ? (
            <section className="empty-state">
              <h1>
                {isLoading
                  ? "Cargando el perfil…"
                  : "Este perfil no está disponible"}
              </h1>
              <p>Puedes consultar otros perfiles en el catálogo.</p>
              <Link href="/catalogo" className="gold-button">
                Ver maestros
              </Link>
            </section>
          ) : (
            <>
              {isExample && (
                <div className="demo-notice">
                  <Sparkles size={16} aria-hidden="true" />
                  <p>
                    <strong>Perfil de ejemplo.</strong> La identidad, foto
                    ilustrativa, experiencia, reseñas y disponibilidad son de
                    ejemplo.
                  </p>
                </div>
              )}
              <article className="profile-detail full-profile">
                <div className="profile-identity">
                  <div className="profile-portrait circular-portrait">
                    <span className="avatar-initials" aria-hidden="true">
                      {master.name[0]}
                    </span>
                    {avatar && avatar !== failedAvatar && (
                      <Image
                        src={avatar}
                        alt={`Retrato ${isExample ? "ilustrativo de" : "de"} ${master.name}`}
                        fill
                        unoptimized
                        loading="eager"
                        sizes="240px"
                        onError={() => setFailedAvatar(avatar)}
                      />
                    )}
                  </div>
                  <span
                    className={`profile-status ${master.isOnline ? "online" : "busy"}`}
                  >
                    <span aria-hidden="true" />
                    {master.isOnline ? "En línea" : "Ocupado"}
                  </span>
                  <span className="profile-availability-note">
                    {isDemo
                      ? "Disponibilidad de ejemplo"
                      : master.isOnline
                        ? "Puedes compartir tu pregunta"
                        : "Puedes dejar tu pregunta en el chat"}
                  </span>
                  <button
                    className="outline-button"
                    aria-pressed={favorites.includes(master.id)}
                    onClick={() => toggleFavorite(master.id)}
                  >
                    <Heart
                      size={16}
                      fill={
                        favorites.includes(master.id) ? "currentColor" : "none"
                      }
                      aria-hidden="true"
                    />
                    {favorites.includes(master.id)
                      ? "Guardado en favoritos"
                      : "Guardar en favoritos"}
                  </button>
                </div>
                <div className="profile-description">
                  <span className="eyebrow">
                    <Moon size={14} aria-hidden="true" /> PERFIL DEL MAESTRO
                  </span>
                  <h1>{master.name}</h1>
                  <CountryFlag code={master.countryCode} showName />
                  <div className="specialty-pills" aria-label="Especialidades">
                    {(master.specialties ?? [master.specialty]).map(
                      (specialty) => (
                        <span key={specialty}>{specialty}</span>
                      ),
                    )}
                  </div>
                  {master.reviewsCount > 0 && (
                    <div className="profile-review-summary">
                      <span
                        className="profile-stars"
                        role="img"
                        aria-label={`${master.rating.toFixed(1)} de 5 estrellas`}
                      >
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            size={16}
                            fill={
                              index < Math.round(master.rating)
                                ? "currentColor"
                                : "none"
                            }
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                      <strong>{master.rating.toFixed(1)}</strong>
                      <span>
                        {master.reviewsCount} reseñas
                        {isDemo ? " de ejemplo" : ""}
                      </span>
                    </div>
                  )}
                  {master.experienceYears > 0 && (
                    <div className="experience-highlight">
                      <span>{master.experienceYears}</span>
                      <p>
                        años de experiencia
                        <br />
                        <small>
                          {isDemo
                            ? "Trayectoria de demostración"
                            : "Experiencia indicada en el perfil"}
                        </small>
                      </p>
                    </div>
                  )}
                  <section
                    className="profile-biography"
                    aria-labelledby="bio-heading"
                  >
                    <h2 id="bio-heading">Sobre sus consultas</h2>
                    <p>{master.bio}</p>
                  </section>
                  <p className="profile-gentle-note">
                    Puedes preguntar por su forma de trabajar antes de
                    continuar.
                  </p>
                </div>
              </article>
              <section className="profile-before-chat">
                <MessageCircle size={22} aria-hidden="true" />
                <div>
                  <h2>Antes de escribir</h2>
                  <p>
                    Solo te pediremos un nombre y tu pregunta. Si ya has
                    consultado antes, podrás reutilizar tus datos.
                  </p>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
      {master && (
        <div className="consultation-dock">
          <div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="gold-button start-consultation"
              onClick={beginConsultation}
              disabled={checking || isLoading}
            >
              {checking ? (
                <LoaderCircle className="spin" size={20} aria-hidden="true" />
              ) : (
                <MessageCircle size={20} aria-hidden="true" />
              )}
              {checking
                ? "Buscando tu conversación…"
                : "Iniciar Consulta por Chat"}
            </button>
            <span>Sin registro previo · Consulta inicial gratuita</span>
          </div>
        </div>
      )}
      <BottomNav />
      {master && intakeOpen && (
        <ConsultationIntakeModal
          master={master}
          isDemo={isDemo}
          onClose={() => setIntakeOpen(false)}
        />
      )}
      {master && existingRoomId && (
        <AstralModal
          title="Tu conversación te espera"
          onClose={() => setExistingRoomId(null)}
        >
          <p className="modal-intro">
            Ya tienes un chat con {master.name}. Puedes retomarlo o compartir
            una nueva pregunta en la misma conversación.
          </p>
          <div className="continuation-actions">
            <button
              className="gold-button"
              onClick={() => {
                flushSync(() => setExistingRoomId(null));
                router.push(`/chat/${encodeURIComponent(existingRoomId)}`);
              }}
            >
              <MessageCircle size={18} aria-hidden="true" />
              Continuar mi chat
            </button>
            <button
              className="outline-button"
              onClick={() => {
                setExistingRoomId(null);
                setIntakeOpen(true);
              }}
            >
              Iniciar una nueva consulta
            </button>
          </div>
          <p className="intake-privacy">Tu historial anterior se conservará.</p>
        </AstralModal>
      )}
    </div>
  );
}
