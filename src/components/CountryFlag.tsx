import Image from "next/image";
import { countryName, normalizeCountryCode } from "@/lib/countries";

/** Local SVGs work even on platforms that render flag emoji as letters. */
export default function CountryFlag({
  code,
  showName = false,
}: {
  code?: string | null;
  showName?: boolean;
}) {
  const country = normalizeCountryCode(code);
  if (!country) return null;
  const name = countryName(country);
  return (
    <span className="country-badge" title={name}>
      <Image
        src={`/flags/${country}.svg`}
        width={24}
        height={16}
        unoptimized
        alt={showName ? "" : `País: ${name}`}
      />
      {showName && <span>{name}</span>}
    </span>
  );
}
