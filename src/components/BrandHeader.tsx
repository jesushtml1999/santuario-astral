import Link from "next/link";
import { Moon } from "lucide-react";

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
        </span>
        <span>
          Santuario <span className="brand-accent">Astral</span>
          <small>CONSULTAS POR CHAT</small>
        </span>
      </Link>
      <span className="header-note">Tarot y orientación espiritual</span>
    </header>
  );
}
