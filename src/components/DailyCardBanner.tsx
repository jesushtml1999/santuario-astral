"use client";

import { type MouseEvent, useSyncExternalStore } from "react";
import { ArrowDown, ArrowRight, Heart, Sparkles } from "lucide-react";
import "./DailyCardBanner.css";
import {
  dailyCards,
  getDailyCardSnapshot,
  revealDailyCard,
  subscribeDailyCard,
} from "@/lib/dailyCard";

const arcanaNumbers: Record<(typeof dailyCards)[number]["id"], string> = {
  estrella: "XVII",
  sol: "XIX",
  emperatriz: "III",
  enamorados: "VI",
  luna: "XVIII",
  fuerza: "VIII",
};

function goToMasters(event: MouseEvent<HTMLAnchorElement>) {
  const catalog = document.getElementById("maestros");
  if (!catalog) return;
  event.preventDefault();
  catalog.focus({ preventScroll: true });
  catalog.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "start",
  });
}

export default function DailyCardBanner() {
  const selection = useSyncExternalStore(
    subscribeDailyCard,
    getDailyCardSnapshot,
    () => null,
  );
  const card = dailyCards.find((item) => item.id === selection?.split("|")[1]);

  return (
    <section
      className={`daily-banner daily-love-banner sa-tarot-banner ${card ? "is-revealed sa-tarot-revealed" : ""}`}
      aria-label="Tu Carta del Día"
      data-tarot-banner
    >
      <div className="daily-orbit" aria-hidden="true" />
      <div className="daily-copy sa-tarot-copy">
        <span className="eyebrow sa-tarot-eyebrow">
          <Heart size={13} aria-hidden="true" /> AMOR Y CONEXIÓN
        </span>
        <h2>Tu Carta del Día</h2>
        <div
          aria-live="polite"
          aria-atomic="true"
          className={`daily-message ${card ? "sa-tarot-reading" : ""}`}
        >
          {card ? (
            <>
              <span className="sa-tarot-reading-label">Tu mensaje de hoy</span>
              <h3>{card.name}</h3>
              <p>{card.message}</p>
            </>
          ) : (
            <p>
              Piensa en esa persona especial. Descubre el mensaje de hoy para
              tu corazón y tus vínculos.
            </p>
          )}
        </div>
      </div>
      <div className="sa-tarot-stage" key={card?.id ?? "unrevealed"}>
        <span className="sa-tarot-constellation" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((spark) => (
            <span key={spark} className="sa-tarot-spark" />
          ))}
        </span>
        <button
          className="sa-tarot-card"
          onClick={revealDailyCard}
          disabled={Boolean(card)}
          aria-label={
            card ? `Carta de hoy: ${card.name}` : "Revelar mi carta del día"
          }
        >
          <span className="sa-tarot-face" aria-hidden="true">
            <span className="sa-tarot-number">{card ? arcanaNumbers[card.id] : "VI"}</span>
            <span className="sa-tarot-art" data-card={card?.id ?? "enamorados"} />
            <span className="sa-tarot-caption">
              {card ? card.name : "Vínculos del alma"}
            </span>
            {[0, 1, 2, 3].map((corner) => (
              <svg key={corner} className="sa-tarot-corner" viewBox="0 0 40 40" fill="none">
                <path d="M3 35V3H35M7 29C18 29 9 9 29 7M7 19C19 19 19 7 19 7M11 11L16 16" />
                <path d="M7 7L10 4L13 7L10 10Z" fill="currentColor" stroke="none" />
                <circle cx="22" cy="11" r="2" />
              </svg>
            ))}
          </span>
        </button>
      </div>
      <div className="daily-love-offer sa-tarot-offer">
        <p>
          Todos nuestros maestros trabajan amarres, retorno, endulzamiento,
          encantamiento y limpieza energética.
        </p>
        <strong className="daily-free-consultation">
          <Sparkles size={14} aria-hidden="true" /> Consulta totalmente gratis
        </strong>
        {card ? (
          <div className="daily-masters-action">
            <p className="daily-masters-cue">
              <span>Elige un maestro para continuar</span>
              <ArrowDown size={30} strokeWidth={2.5} aria-hidden="true" />
            </p>
            <a
              className="gold-button daily-masters-button"
              href="#maestros"
              onClick={goToMasters}
            >
              <span>Ver maestros</span> <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        ) : (
          <button className="gold-button" onClick={revealDailyCard}>
            <Heart size={15} aria-hidden="true" /> Revelar mi carta
          </button>
        )}
        <span className="daily-footnote">
          {card
            ? "Elige un maestro y cuéntale lo que siente tu corazón."
            : "Tu primer paso hacia una conexión especial."}
        </span>
      </div>
    </section>
  );
}
