"use client";
import { COUNTRIES } from "@/lib/countries";
import CountryFlag from "@/components/CountryFlag";

export default function CountrySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      País del maestro (público, opcional)
      <span className="country-select-row">
        <CountryFlag code={value} />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">Sin país asignado</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name} ({country.code})
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
