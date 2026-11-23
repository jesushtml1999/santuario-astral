"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Compass,
  ArrowDownRight,
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
                  <span className="eyebrow">
                    <span className="eyebrow-rule" /> TAROT, AMOR Y ASTROLOGÍA
                  </span>
                  <h1>
                    Habla de lo que
                    <br />
                    <em>te preocupa.</em>
                  </h1>
                  <p>
                    Elige un maestro, conoce su forma de trabajar y haz tu
                    primera pregunta por chat. Sin crear una cuenta.
                  </p>
                  <span className="hero-note">
                    Consulta inicial gratuita · Tú eliges con quién hablar
                  </span>
                  <a className="text-link hero-catalog-link" href="#maestros">
                    Conocer a los maestros{" "}
                    <ArrowDownRight size={18} aria-hidden="true" />
                  </a>
                </div>
                <DailyCardBanner />
              </section>
              <div className="section-divider" aria-hidden="true">
                <span />
                <span className="divider-caption">EL CATÁLOGO</span>
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
                    {isFavorites ? "TU SELECCIÓN" : "PERSONAS Y ESPECIALIDADES"}
                  </span>
                  <h2 id="catalog-title">
                    {isFavorites
                      ? "Tus maestros favoritos"
                      : "Elige a tu maestro"}
                  </h2>
                  <p>
                    {isFavorites
                      ? "Los perfiles que guardaste, en un solo lugar."
                      : "Revisa su perfil y escribe cuando quieras."}
                  </p>
                </div>
                <label className="search-field">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">
                    Buscar por nombre o especialidad
                  </span>
                  <input
                    type="search"
                    placeholder="Nombre o especialidad"
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
                    {name}
                  </button>
                ))}
              </div>
              {isDemo && (
                <div className="demo-notice" role="status">
                  <Sparkles size={16} aria-hidden="true" />
                  <p>
                    <strong>Catálogo de demostración.</strong> Los perfiles,
                    reseñas y estados de conexión son de ejemplo.
                  </p>
                </div>
              )}
              <div className="catalog-count" aria-live="polite">
                <span>
                  {visibleMasters.length}{" "}
                  {visibleMasters.length === 1 ? "perfil" : "perfiles"}
                </span>
                <span>
                  {isLoading
                    ? "Cargando perfiles…"
                    : "Consulta por chat, sin registro"}
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
                      ? "Todavía no guardaste perfiles"
                      : "No hay perfiles con esos filtros"}
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
                      Ver maestros
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
              <h1>Acceso de maestros</h1>
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
            <details className="catalog-connection-footer catalog-service-note">
              <summary>Estado del servicio</summary>
              <FirestoreConnectionStatus />
            </details>
          )}
          <footer className="page-footer">
            <p>Santuario Astral</p>
            <span>Tarot y orientación espiritual por chat.</span>
            <small>Orientación espiritual para la reflexión personal.</small>
          </footer>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
