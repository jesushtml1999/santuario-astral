"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Heart, Star } from "lucide-react";
import { safeAvatarUrl } from "@/lib/masters";
import type { MasterProfile } from "@/types";
import CountryFlag from "@/components/CountryFlag";

export default function MasterCard({
  master,
  isDemo,
  isFavorite,
  onToggleFavorite,
  eager = false,
}: {
  master: MasterProfile;
  isDemo: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  eager?: boolean;
}) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const avatar = safeAvatarUrl(master.avatarUrl);
  const isExample = isDemo || master.isTestProfile === true;
  const initials = master.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <article className="master-card">
      <Link
        href={`/maestro/${encodeURIComponent(master.id)}`}
        className="master-link"
        aria-label={`Ver perfil de ${master.name}, ${master.specialty}`}
      >
        <div className="master-photo">
          <span className="avatar-initials" aria-hidden="true">
            {initials}
          </span>
          {avatar && failedAvatar !== avatar && (
            <Image
              src={avatar}
              alt={`Retrato ${isExample ? "ilustrativo de" : "de"} ${master.name}`}
              fill
              sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 280px"
              unoptimized
              loading={eager ? "eager" : "lazy"}
              onError={() => setFailedAvatar(avatar)}
            />
          )}
          <span
            className={`availability ${master.isOnline ? "online" : "busy"}`}
          >
            <span aria-hidden="true" />
            {master.isOnline ? "En línea" : "Ocupado"}
          </span>
          <span className="free-consultation-badge">CONSULTA GRATIS</span>
        </div>
        <div className="master-copy">
          <span className="specialty">{master.specialty}</span>
          <h3>
            {master.name} <CountryFlag code={master.countryCode} />
          </h3>
          <p className="master-bio">{master.bio}</p>
          <div className="master-rating">
            <Star size={13} fill="currentColor" aria-hidden="true" />
            <strong>{master.rating.toFixed(1)}</strong>
            <span>({master.reviewsCount} reseñas)</span>
          </div>
          <div className="master-footer">
            <span>{master.experienceYears} años de experiencia</span>
            <span className="profile-cta">Ver perfil</span>
          </div>
        </div>
      </Link>
      <button
        className={`favorite-button ${isFavorite ? "is-favorite" : ""}`}
        onClick={() => onToggleFavorite(master.id)}
        aria-label={`${isFavorite ? "Quitar a" : "Guardar a"} ${master.name} ${isFavorite ? "de" : "en"} favoritos`}
        aria-pressed={isFavorite}
      >
        <Heart
          size={17}
          fill={isFavorite ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>
    </article>
  );
}
