export const dailyCards = [
  {
    id: "estrella",
    name: "La Estrella",
    symbol: "star",
    message:
      "No necesitas resolverlo todo hoy. Piensa qué te haría sentir más calma en esta relación.",
  },
  {
    id: "sol",
    name: "El Sol",
    symbol: "sun",
    message:
      "Una conversación clara puede ayudar más que seguir imaginando respuestas. Empieza por decir lo que necesitas.",
  },
  {
    id: "emperatriz",
    name: "La Emperatriz",
    symbol: "leaf",
    message:
      "Cuidar de otra persona también deja espacio para ti. Reserva un momento para tus propias necesidades.",
  },
  {
    id: "enamorados",
    name: "Los Enamorados",
    symbol: "heart",
    message:
      "Antes de decidir, distingue lo que deseas de lo que temes perder. Las dos cosas merecen atención.",
  },
  {
    id: "luna",
    name: "La Luna",
    symbol: "moon",
    message:
      "Si algo no está claro, no te apresures a sacar conclusiones. Busca información y date tiempo.",
  },
  {
    id: "fuerza",
    name: "La Fuerza",
    symbol: "flame",
    message:
      "Puedes poner un límite sin dejar de sentir cariño. Piensa qué necesitas para estar bien.",
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
