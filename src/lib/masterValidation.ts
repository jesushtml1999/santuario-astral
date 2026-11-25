import type { MasterProfile } from "@/types";
import { presenceExpiry } from "@/lib/presence";
import type { MasterEditorInput } from "@/types/staff";
import { assertHostedAvatar } from "@/lib/mediaUploads";
import {
  normalizeCountryCode,
  validateCountryCode,
  validatePhone,
} from "@/lib/countries";

export const MASTER_SPECIALTIES = [
  "Tarot",
  "Amor",
  "Limpias",
  "Astrología",
  "Numerología",
] as const;
export function safeAvatarUrl(value: string): string {
  if (
    /^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value) &&
    value.length <= 2_900_000
  )
    return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function parseMaster(id: string, value: unknown): MasterProfile | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (
    ["name", "specialty", "bio"].some(
      (key) => typeof data[key] !== "string" || !data[key].trim(),
    ) ||
    typeof data.avatarUrl !== "string" ||
    typeof data.experienceYears !== "number" ||
    !Number.isInteger(data.experienceYears) ||
    data.experienceYears < 0 ||
    typeof data.rating !== "number" ||
    !Number.isFinite(data.rating) ||
    data.rating < 0 ||
    data.rating > 5 ||
    typeof data.reviewsCount !== "number" ||
    !Number.isInteger(data.reviewsCount) ||
    data.reviewsCount < 0 ||
    typeof data.isOnline !== "boolean" ||
    typeof data.isActive !== "boolean"
  )
    return null;
  const specialties =
    Array.isArray(data.specialties) &&
    data.specialties.every((item) => typeof item === "string" && item.trim())
      ? (data.specialties as string[])
      : [String(data.specialty)];
  return {
    id,
    name: String(data.name),
    countryCode: normalizeCountryCode(data.countryCode),
    specialty: String(data.specialty),
    specialties,
    bio: String(data.bio),
    avatarUrl: safeAvatarUrl(data.avatarUrl),
    experienceYears: data.experienceYears,
    rating: data.rating,
    reviewsCount: data.reviewsCount,
    isOnline: data.isOnline,
    ...(presenceExpiry(data.presenceExpiresAt) !== undefined
      ? { presenceExpiresAt: presenceExpiry(data.presenceExpiresAt) }
      : {}),
    isActive: data.isActive,
    isTestProfile: data.isTestProfile === true,
  };
}
export function validateMasterInput(
  value: unknown,
  creating: boolean,
  cloud: boolean,
  accessPending = false,
): MasterEditorInput {
  if (typeof value !== "object" || value === null)
    throw new Error("Revisa los datos del maestro.");
  const data = value as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const bio = typeof data.bio === "string" ? data.bio.trim() : "";
  const login =
    typeof data.login === "string" ? data.login.trim().toLowerCase() : "";
  const avatarUrl =
    typeof data.avatarUrl === "string" ? data.avatarUrl.trim() : "";
  const specialties = Array.isArray(data.specialties)
    ? [
        ...new Set(
          data.specialties
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ]
    : [];
  const password = typeof data.password === "string" ? data.password : "";
  const unassigned = cloud && !creating && accessPending && !login && !password;
  if (
    !name ||
    name.length > 100 ||
    !bio ||
    bio.length > 4000 ||
    (!login && !unassigned) ||
    login.length > 160 ||
    !specialties.length ||
    specialties.length > 5 ||
    specialties.some(
      (item) => !(MASTER_SPECIALTIES as readonly string[]).includes(item),
    ) ||
    typeof data.experienceYears !== "number" ||
    !Number.isInteger(data.experienceYears) ||
    data.experienceYears < 0 ||
    data.experienceYears > 100 ||
    (avatarUrl && !safeAvatarUrl(avatarUrl))
  )
    throw new Error(
      "Completa nombre, especialidades, biografía, experiencia y un acceso válido. La foto debe ser HTTPS o una imagen admitida.",
    );
  if (cloud && !unassigned && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login))
    throw new Error("Para Firebase utiliza un correo electrónico válido.");
  if (cloud && accessPending && !unassigned && !password)
    throw new Error(
      "Para activar este acceso indica correo y contraseña. Puedes dejarlos vacíos y guardar solo el perfil.",
    );
  if (cloud) assertHostedAvatar(avatarUrl);
  if (
    (creating || password) &&
    (password.length < (cloud ? 12 : 8) || password.length > 128)
  )
    throw new Error(
      `La contraseña debe tener entre ${cloud ? 12 : 8} y 128 caracteres.`,
    );
  return {
    name,
    countryCode: validateCountryCode(data.countryCode),
    phone: validatePhone(data.phone),
    bio,
    login,
    specialties,
    avatarUrl,
    experienceYears: data.experienceYears,
    password: password || undefined,
    isTestProfile: data.isTestProfile === true,
  };
}
