export const dailyCards = [
  {
    id: "estrella",
    name: "La Estrella",
    symbol: "star",
    message:
      "Vuelve a confiar en tu luz. Hoy, un pequeño paso puede acercarte a aquello que te inspira.",
  },
  {
    id: "sol",
    name: "El Sol",
    symbol: "sun",
    message:
      "Deja espacio para la alegría. Reconoce lo que ya florece en tu vida y compártelo con quienes quieres.",
  },
  {
    id: "emperatriz",
    name: "La Emperatriz",
    symbol: "leaf",
    message:
      "Cuida de ti con la misma ternura que ofreces a otros. Dale tiempo y atención a lo que deseas crear.",
  },
  {
    id: "enamorados",
    name: "Los Enamorados",
    symbol: "heart",
    message:
      "Escucha lo que sientes y elige desde tus valores. Los vínculos crecen con presencia y honestidad.",
  },
  {
    id: "luna",
    name: "La Luna",
    symbol: "moon",
    message:
      "No necesitas tener todas las respuestas hoy. Haz una pausa y deja que tus emociones encuentren su voz.",
  },
  {
    id: "fuerza",
    name: "La Fuerza",
    symbol: "flame",
    message:
      "Tu fuerza también vive en la calma. Acércate a los retos con paciencia, compasión y confianza en ti.",
  },
] as const;

const KEY = "santuario-astral:daily-card";
const EVENT = "santuario-astral:daily-card-changed";
let memorySelection: string | null = null;

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validSelection(value: string | null): string | null {
  if (!value) return null;
  const [day, id] = value.split("|");
  return day === localDay() && dailyCards.some((card) => card.id === id)
    ? value
    : null;
}

export function getDailyCardSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = validSelection(window.localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    /* Private browsing can deny access to storage. */
  }
  return validSelection(memorySelection);
}

export function revealDailyCard(): void {
  if (getDailyCardSnapshot()) return;
  const card = dailyCards[Math.floor(Math.random() * dailyCards.length)];
  memorySelection = `${localDay()}|${card.id}`;
  try {
    window.localStorage.setItem(KEY, memorySelection);
  } catch {
    /* Keep today's selection in memory if persistence is unavailable. */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeDailyCard(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      memorySelection = null;
      listener();
    }
  };
  // Refresh the date after midnight, tab focus or returning from suspension.
  const interval = window.setInterval(listener, 30_000);
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", listener);
  document.addEventListener("visibilitychange", listener);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", listener);
    document.removeEventListener("visibilitychange", listener);
  };
}
