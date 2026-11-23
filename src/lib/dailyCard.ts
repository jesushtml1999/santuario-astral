export const dailyCards = [
  {
    id: "estrella",
    name: "La Estrella",
    symbol: "star",
    message:
      "Hay espacio para renovar la esperanza en el amor. Comparte con un maestro lo que deseas sanar o reconectar en ese vínculo especial.",
  },
  {
    id: "sol",
    name: "El Sol",
    symbol: "sun",
    message:
      "Dale luz a lo que sientes. Una conversación sincera puede ayudarte a comprender tus deseos de amor, cercanía y retorno.",
  },
  {
    id: "emperatriz",
    name: "La Emperatriz",
    symbol: "leaf",
    message:
      "La ternura empieza contigo. Explora el endulzamiento y el cuidado de tus vínculos como una intención de amor y armonía.",
  },
  {
    id: "enamorados",
    name: "Los Enamorados",
    symbol: "heart",
    message:
      "Tu corazón merece ser escuchado. Habla de esa conexión, de tus dudas sobre amarres o de tu deseo de volver a encontrarte con alguien.",
  },
  {
    id: "luna",
    name: "La Luna",
    symbol: "moon",
    message:
      "Escucha lo que tu corazón guarda en silencio. La limpieza energética puede ser un ritual de intención para soltar cargas y mirar tus vínculos con calma.",
  },
  {
    id: "fuerza",
    name: "La Fuerza",
    symbol: "flame",
    message:
      "Cultiva un amor que también te cuide. Consulta tus inquietudes sobre encantamiento y reconexión desde el respeto por ti y por la otra persona.",
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
