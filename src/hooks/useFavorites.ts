"use client";

import { useSyncExternalStore } from "react";

const KEY = "santuario-astral:favorites";
const EVENT = "santuario-astral:favorites-changed";
let memoryValue = "[]";
let memoryOnly = false;

function snapshot(): string {
  if (typeof window === "undefined") return "[]";
  if (memoryOnly) return memoryValue;
  try {
    return window.localStorage.getItem(KEY) ?? memoryValue;
  } catch {
    return memoryValue;
  }
}

function parse(value: string): string[] {
  try {
    const data: unknown = JSON.parse(value);
    return Array.isArray(data)
      ? data.filter(
          (id): id is string =>
            typeof id === "string" && id.length > 0 && id.length <= 256,
        )
      : [];
  } catch {
    return [];
  }
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      memoryOnly = false;
      memoryValue = "[]";
      listener();
    }
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFavorites() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const favorites = parse(value);

  function toggleFavorite(id: string) {
    const current = parse(snapshot());
    memoryValue = JSON.stringify(
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    try {
      window.localStorage.setItem(KEY, memoryValue);
      memoryOnly = false;
    } catch {
      memoryOnly = true;
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return { favorites, toggleFavorite };
}
