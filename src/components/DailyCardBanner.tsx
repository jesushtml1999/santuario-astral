"use client";

import { type MouseEvent, useSyncExternalStore } from "react";
import { ArrowRight, Flame, Heart, Leaf, Moon, Star, Sun } from "lucide-react";
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
      <div className="daily-copy">
        <span className="eyebrow">UNA PAUSA DIARIA</span>
        <h2>Tu Carta del Día</h2>
        <div aria-live="polite" aria-atomic="true" className="daily-message">
          {card ? (
            <>
              <h3>{card.name}</h3>
              <p>{card.message}</p>
            </>
          ) : (
            <p>
              Piensa en lo que estás viviendo. Saca una carta y toma un momento
              para leer su mensaje.
            </p>
          )}
        </div>
      </div>
      <div className="tarot-stage">
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
              <Symbol
                className="tarot-love-symbol"
                size={18}
                strokeWidth={1.2}
              />
              <svg
                viewBox="0 0 100 120"
                fill="none"
                className="embracing-couple"
              >
                <ellipse
                  cx="50"
                  cy="54"
                  rx="38"
                  ry="44"
                  stroke="currentColor"
                  strokeOpacity=".22"
                />
                <circle cx="40" cy="28" r="10" fill="currentColor" />
                <circle
                  cx="61"
                  cy="25"
                  r="10"
                  fill="currentColor"
                  fillOpacity=".72"
                />
                <path
                  d="M36 41C25 43 23 55 27 69L19 105C30 111 47 112 55 105L48 71L52 53C50 45 44 40 36 41Z"
                  fill="currentColor"
                />
                <path
                  d="M62 38C72 38 78 48 75 61L72 76L83 105C72 112 57 112 49 105L52 73L48 52C47 44 53 38 62 38Z"
                  fill="currentColor"
                  fillOpacity=".72"
                />
                <path
                  d="M31 49C38 61 52 66 68 58M68 47C62 58 48 64 35 60"
                  stroke="#dbccb0"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d="M31 47C38 58 52 63 68 55M68 45C62 55 48 61 35 57"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="tarot-line" />
            <span className="tarot-caption">
              {card ? card.name : "LOS ENAMORADOS"}
            </span>
            <Star className="tarot-star bottom" size={10} />
          </span>
        </button>
      </div>
      <div className="daily-love-offer">
        <p>
          Amor, retorno, amarres, endulzamiento, encantamiento y limpieza
          energética. Consulta el perfil de cada maestro para conocer su
          trabajo.
        </p>
        <strong className="daily-free-consultation">
          Consulta inicial gratuita
        </strong>
        {card ? (
          <a
            className="gold-button daily-masters-button"
            href="#maestros"
            onClick={goToMasters}
          >
            <span>Ver maestros</span>{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        ) : (
          <button className="gold-button" onClick={revealDailyCard}>
            Sacar mi carta <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
        <span className="daily-footnote">
          {card
            ? "Si quieres hablar de tu situación, elige un maestro."
            : "Tu carta se conserva durante el día."}
        </span>
      </div>
    </section>
  );
}
