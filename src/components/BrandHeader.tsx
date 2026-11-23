import Link from "next/link";
import { Moon, Sparkles } from "lucide-react";

export default function BrandHeader() {
  return (
    <header className="brand-header">
      <Link
        href="/catalogo"
        className="brand"
        aria-label="Santuario Astral, inicio"
      >
        <span className="brand-mark" aria-hidden="true">
          <Moon size={24} strokeWidth={1.3} />
          <Sparkles size={14} />
        </span>
        <span>
          Santuario <span className="brand-accent">Astral</span>
          <small>UN ENCUENTRO CONTIGO</small>
        </span>
      </Link>
      <span className="header-note">
        <Sparkles size={14} aria-hidden="true" /> Tu camino comienza aquí
      </span>
    </header>
  );
}
