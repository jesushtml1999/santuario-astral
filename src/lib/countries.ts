import { getAlpha2Codes, getNames, registerLocale } from "i18n-iso-countries";
import spanish from "i18n-iso-countries/langs/es.json";

registerLocale(spanish);
const codes = new Set(Object.keys(getAlpha2Codes()));
export function normalizeCountryCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return codes.has(code) ? code : "";
}
export const COUNTRIES = Object.entries(getNames("es", { select: "official" }))
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));
export function countryName(value: unknown): string {
  return (
    COUNTRIES.find((country) => country.code === normalizeCountryCode(value))
      ?.name ?? ""
  );
}
export function validateCountryCode(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const code = normalizeCountryCode(value);
  if (!code)
    throw new Error("Selecciona un país válido o deja el campo vacío.");
  return code;
}
/** Blank is allowed. No inference or fabrication of contact details. */
export function validatePhone(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string")
    throw new Error(
      "El teléfono debe ser texto en formato internacional E.164.",
    );
  const phone = value.trim();
  if (phone && !/^\+[1-9]\d{6,14}$/.test(phone))
    throw new Error(
      "Usa formato internacional E.164, por ejemplo +573001234567, sin espacios ni extensiones (7 a 15 dígitos).",
    );
  return phone;
}
