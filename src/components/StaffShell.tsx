"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, Moon, Sparkles } from "lucide-react";
import { signOutStaff } from "@/lib/staffAuth";
import type { StaffSession } from "@/types/staff";

export default function StaffShell({
  session,
  children,
}: {
  session: StaffSession;
  children: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await signOutStaff();
      router.replace("/maestro/login");
    } catch {
      setError("No pudimos cerrar tu sesión. Inténtalo de nuevo.");
      setBusy(false);
    }
  }
  return (
    <div className="astral-shell staff-shell">
      <div className="page-container">
        <header className="staff-header">
          <Link href="/catalogo" className="staff-brand">
            <Moon size={22} aria-hidden="true" />
            <span>
              Santuario <em>Astral</em>
              <small>
                {session.role === "admin"
                  ? "ADMINISTRACIÓN"
                  : "ESPACIO DE MAESTROS"}
              </small>
            </span>
          </Link>
          <div className="staff-header-actions">
            <Link href="/catalogo">Ver catálogo</Link>
            <button onClick={logout} disabled={busy} aria-label="Cerrar sesión">
              <LogOut size={18} aria-hidden="true" />
              <span>{busy ? "Saliendo…" : "Salir"}</span>
            </button>
          </div>
        </header>
        {session.mode === "local" && (
          <div className="staff-demo-notice">
            <Sparkles size={16} aria-hidden="true" />
            <p>
              <strong>Modo demostración local.</strong> Perfiles y accesos de
              prueba guardados en este navegador. Esta sesión de personal se
              mantiene solo en esta pestaña.
            </p>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <main id="contenido">{children}</main>
      </div>
    </div>
  );
}
