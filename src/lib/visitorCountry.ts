import { countryName, normalizeCountryCode } from "@/lib/countries";

export const FALLBACK_VISITOR_COUNTRY = "NI";

export interface VisitorCountry {
  countryCode: string;
  detected: boolean;
}

/** Presentation only: never use this header for authorization or master data. */
export function resolveVisitorCountry(
  countryHeader: string | null | undefined,
): VisitorCountry {
  const countryCode = normalizeCountryCode(countryHeader);
  return {
    countryCode: countryCode || FALLBACK_VISITOR_COUNTRY,
    detected: Boolean(countryCode),
  };
}

export function visitorCountryLabel(country: VisitorCountry): string {
  const name = countryName(country.countryCode);
  return country.detected
    ? `Tu ubicación aproximada: ${name}`
    : `País de referencia: ${name} (ubicación no detectada)`;
}
