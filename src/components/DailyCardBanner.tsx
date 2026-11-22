"use client";

import { useSyncExternalStore } from "react";
import { Flame, Heart, Leaf, Moon, Sparkles, Star, Sun } from "lucide-react";
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
      className={`daily-banner ${card ? "is-revealed" : ""}`}
      aria-label="Tu Carta del Día"
    >
      <div className="daily-orbit" aria-hidden="true" />
      <div className="daily-copy">
        <span className="eyebrow">
          <Sparkles size={13} aria-hidden="true" /> UN MOMENTO PARA TI
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
              Respira, conecta con tu intención
              <br className="desktop-break" /> y descubre el mensaje de hoy.
            </p>
          )}
        </div>
        <button
          className="gold-button"
          onClick={revealDailyCard}
          disabled={Boolean(card)}
        >
          <Sparkles size={15} aria-hidden="true" />
          {card ? "Tu mensaje de hoy" : "Revelar mi carta"}
        </button>
        <span className="daily-footnote">
          {card
            ? "Una nueva carta te espera mañana"
            : "Un instante de calma, cada día"}
        </span>
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
          <span className="tarot-halo">
            <Symbol size={42} strokeWidth={1.1} />
          </span>
          <span className="tarot-line" />
          <span className="tarot-caption">
            {card ? card.name : "SANTUARIO ASTRAL"}
          </span>
          <Star className="tarot-star bottom" size={10} />
        </span>
      </button>
    </section>
  );
}
