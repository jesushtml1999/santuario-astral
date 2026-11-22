"use client";

import { type MouseEvent, useSyncExternalStore } from "react";
import { ArrowRight, Flame, Heart, Leaf, Moon, Sparkles, Star, Sun } from "lucide-react";
import {
  dailyCards,
  getDailyCardSnapshot,
  revealDailyCard,
  subscribeDailyCard,
} from "@/lib/dailyCard";

const symbols = {
  star: Star,
  sun: Sun,
  leaf: Leaf,
  heart: Heart,
  moon: Moon,
  flame: Flame,
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
  const Symbol = card ? symbols[card.symbol] : Moon;

  return (
    <section
      className={`daily-banner daily-love-banner ${card ? "is-revealed" : ""}`}
      aria-label="Tu Carta del Día"
    >
      <div className="daily-orbit" aria-hidden="true" />
      <div className="daily-copy">
        <span className="eyebrow">
          <Heart size={13} aria-hidden="true" /> AMOR Y CONEXIÓN
        </span>
        <h2>Tu Carta del Día</h2>
        <div aria-live="polite" aria-atomic="true" className="daily-message">
          {card ? (
            <>
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
      <button
        className="tarot-card"
        onClick={revealDailyCard}
        disabled={Boolean(card)}
        aria-label={
          card ? `Carta de hoy: ${card.name}` : "Revelar mi carta del día"
        }
      >
        <span className="tarot-inner" aria-hidden="true">
          <Star className="tarot-star top" size={12} />
          <span className="tarot-embrace">
            <Symbol className="tarot-love-symbol" size={18} strokeWidth={1.2} />
            <svg viewBox="0 0 100 120" fill="none" className="embracing-couple">
              <ellipse cx="50" cy="54" rx="38" ry="44" stroke="currentColor" strokeOpacity=".22" />
              <circle cx="40" cy="28" r="10" fill="currentColor" />
              <circle cx="61" cy="25" r="10" fill="currentColor" fillOpacity=".72" />
              <path d="M36 41C25 43 23 55 27 69L19 105C30 111 47 112 55 105L48 71L52 53C50 45 44 40 36 41Z" fill="currentColor" />
              <path d="M62 38C72 38 78 48 75 61L72 76L83 105C72 112 57 112 49 105L52 73L48 52C47 44 53 38 62 38Z" fill="currentColor" fillOpacity=".72" />
              <path d="M31 49C38 61 52 66 68 58M68 47C62 58 48 64 35 60" stroke="#32223d" strokeWidth="4" strokeLinecap="round" />
              <path d="M31 47C38 58 52 63 68 55M68 45C62 55 48 61 35 57" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="tarot-line" />
          <span className="tarot-caption">
            {card ? card.name : "VÍNCULOS DEL ALMA"}
          </span>
          <Star className="tarot-star bottom" size={10} />
        </span>
      </button>
      <div className="daily-love-offer">
        <p>
          Todos nuestros maestros trabajan amarres, retorno, endulzamiento,
          encantamiento y limpieza energética.
        </p>
        <strong className="daily-free-consultation">
          <Sparkles size={14} aria-hidden="true" /> Consulta totalmente gratis
        </strong>
        {card ? (
          <a className="gold-button" href="#maestros" onClick={goToMasters}>
            Ver maestros <ArrowRight size={16} aria-hidden="true" />
          </a>
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
