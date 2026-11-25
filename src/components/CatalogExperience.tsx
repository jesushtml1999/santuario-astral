"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Compass,
  Flame,
  Heart,
  KeyRound,
  Moon,
  Orbit,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { useMasters } from "@/hooks/useMasters";
import { useFavorites } from "@/hooks/useFavorites";
import BrandHeader from "@/components/BrandHeader";
import BottomNav from "@/components/BottomNav";
import DailyCardBanner from "@/components/DailyCardBanner";
import AnimatedHeroTitle from "@/components/AnimatedHeroTitle";
import MasterCard from "@/components/MasterCard";
import GuestChats from "@/components/GuestChats";
import FirestoreConnectionStatus from "@/components/FirestoreConnectionStatus";

const filters = [
  { name: "Todos", icon: Compass },
  { name: "Tarot", icon: Star },
  { name: "Amor", icon: Heart },
  { name: "Limpias", icon: Flame },
  { name: "Astrología", icon: Moon },
  { name: "Numerología", icon: Orbit },
] as const;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export default function CatalogExperience() {
  const { masters, isDemo, isLoading } = useMasters();
  const { favorites, toggleFavorite } = useFavorites();
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const requestedView = useSearchParams().get("vista");
  const view = ["chats", "favoritos", "maestros"].includes(requestedView ?? "")
    ? requestedView
    : "inicio";
  const isFavorites = view === "favoritos";
  const visibleMasters = masters.filter(
    (master) =>
      master.isActive &&
      (!isFavorites || favorites.includes(master.id)) &&
      (filter === "Todos" ||
        master.specialty === filter ||
        master.specialties?.includes(filter)) &&
      normalize(`${master.name} ${master.specialty} ${master.bio}`).includes(
        normalize(search.trim()),
      ),
  );

  return (
    <div className="astral-shell">
      <div className="page-container">
        <BrandHeader />
        <main id="contenido">
          {view === "inicio" && (
            <>
              <section className="hero-section">
                <div className="hero-copy">
                  <span className="eyebrow sa-hero-eyebrow">
                    LOS MEJORES MAESTROS
                  </span>
                  <AnimatedHeroTitle />
                  <p>
                    Una consulta a tiempo puede mejorar tu relacion de pareja recuerda que hay preguntas que merecen repseusta.
                  </p>
                  <span className="hero-note">
                    <span className="tiny-star" aria-hidden="true">
                      ✧
                    </span>{" "}
                    Sin registros. A tu ritmo. Desde donde estés.
                  </span>
                </div>
                <DailyCardBanner />
              </section>
              <div className="section-divider" aria-hidden="true">
                <span />
                <Sparkles size={16} />
                <span />
              </div>
            </>
          )}

          {(view === "inicio" || isFavorites) && (
            <section
              id="maestros"
              tabIndex={-1}
              className="catalog-section"
              aria-labelledby="catalog-title"
              aria-busy={isLoading}
            >
              <div className="catalog-heading">
                <div>
                  <span className="eyebrow">
                    {isFavorites
                      ? "TUS CONEXIONES ESPECIALES"
                      : "CADA ENCUENTRO, UNA POSIBILIDAD"}
                  </span>
                  <h2 id="catalog-title">
                    {isFavorites ? "Tus guías favoritos" : "Encuentra tu guía"}
                  </h2>
                  <p>
                    {isFavorites
                      ? "Un lugar para volver a quienes te inspiran."
                      : "Elige la energía con la que más conectas."}
                  </p>
                </div>
                <label className="search-field">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">
                    Buscar por nombre o especialidad
                  </span>
                  <input
                    type="search"
                    placeholder="Busca tu conexión…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              <div
                className="filter-bar"
                role="group"
                aria-label="Filtrar por especialidad"
              >
                {filters.map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    onClick={() => setFilter(name)}
                    aria-pressed={filter === name}
                    className={`filter-button ${filter === name ? "selected" : ""}`}
                  >
                    <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
              {isDemo && (
                <div className="demo-notice" role="status">
                  <Sparkles size={16} aria-hidden="true" />
                  <p>
                    <strong>Explora una vista de demostración.</strong> Los
                    perfiles, reseñas y estados de conexión son de ejemplo.
                  </p>
                </div>
              )}
              <div className="catalog-count" aria-live="polite">
                <span>
                  {visibleMasters.length}{" "}
                  {visibleMasters.length === 1
                    ? "guía para descubrir"
                    : "guías para descubrir"}
                </span>
                <span>
                  {isLoading
                    ? "Preparando tu espacio…"
                    : "Un encuentro comienza con una elección"}
                </span>
              </div>
              <div className="masters-grid">
                {visibleMasters.map((master, index) => (
                  <MasterCard
                    key={master.id}
                    master={master}
                    isDemo={isDemo}
                    isFavorite={favorites.includes(master.id)}
                    onToggleFavorite={toggleFavorite}
                    eager={index < 4}
                  />
                ))}
              </div>
              {visibleMasters.length === 0 && (
                <div className="empty-state">
                  <Heart size={32} strokeWidth={1.2} aria-hidden="true" />
                  <h3>
                    {isFavorites && favorites.length === 0
                      ? "Guarda una conexión especial"
                      : "Aún no encontramos esa conexión"}
                  </h3>
                  <p>
                    {isFavorites && favorites.length === 0
                      ? "Toca el corazón de un perfil para encontrarlo aquí cuando quieras."
                      : "Prueba con otro nombre o explora todas las especialidades."}
                  </p>
                  <button
                    className="outline-button"
                    onClick={() => {
                      setFilter("Todos");
                      setSearch("");
                    }}
                  >
                    Limpiar filtros
                  </button>
                  {isFavorites && (
                    <Link href="/catalogo" className="text-link">
                      Explorar guías
                    </Link>
                  )}
                </div>
              )}
            </section>
          )}

          {view === "chats" && <GuestChats />}
          {view === "maestros" && (
            <section className="empty-state destination-state">
              <KeyRound size={38} strokeWidth={1.1} aria-hidden="true" />
              <span className="eyebrow">ESPACIO DE MAESTROS</span>
              <h1>Tu vocación, un nuevo espacio</h1>
              <p>
                Accede a tu bandeja privada o al espacio de administración con
                tu correo y contraseña.
              </p>
              <Link className="gold-button" href="/maestro/login">
                Ir al acceso de maestros
              </Link>
            </section>
          )}

          {view === "inicio" && (
            <div className="catalog-connection-footer">
              <FirestoreConnectionStatus />
            </div>
          )}
          <footer className="page-footer">
            <Sparkles size={17} strokeWidth={1.1} aria-hidden="true" />
            <p>El primer paso es escucharte.</p>
            <span>Santuario Astral · Un encuentro contigo</span>
            <small>Orientación espiritual para la reflexión personal.</small>
          </footer>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
