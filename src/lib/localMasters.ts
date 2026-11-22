import { mockMasters } from "@/lib/mockMasters";
import { parseMaster } from "@/lib/masterValidation";
import type { MasterProfile } from "@/types";

export const MASTERS_KEY = "santuario-astral:masters:v1";
export const MASTERS_CHANGED = "santuario-astral:masters-changed";
export function readLocalMasters(): MasterProfile[] {
  const initial = () =>
    mockMasters.map((profile) => ({
      ...profile,
      specialties: [profile.specialty],
      isTestProfile: true,
    }));
  if (typeof window === "undefined") return initial();
  const serialized = window.localStorage.getItem(MASTERS_KEY);
  if (serialized === null) return initial();
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) throw new Error("Invalid directory");
    const masters = value.map((item: unknown) =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      typeof item.id === "string"
        ? parseMaster(item.id, item)
        : null,
    );
    if (masters.some((item) => item === null))
      throw new Error("Invalid master");
    return masters.filter((item): item is MasterProfile => item !== null);
  } catch {
    throw new Error(
      "No pudimos leer el directorio local. Sus datos no se han modificado.",
    );
  }
}
export function writeLocalMasters(masters: MasterProfile[]): void {
  window.localStorage.setItem(MASTERS_KEY, JSON.stringify(masters));
  window.dispatchEvent(new Event(MASTERS_CHANGED));
}
export async function withDirectoryLock<T>(action: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request("santuario-astral:staff-directory", action);
  return await action();
}
