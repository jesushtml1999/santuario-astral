"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStaffSession } from "@/hooks/useStaffSession";
import type { StaffRole, StaffSession } from "@/types/staff";

export default function StaffGate({
  role,
  children,
}: {
  role: StaffRole;
  children: (session: StaffSession) => ReactNode;
}) {
  const { session, loading, error } = useStaffSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !error && (!session || session.role !== role))
      router.replace(
        !session
          ? "/maestro/login"
          : session.role === "admin"
            ? "/admin"
            : "/maestro/panel",
      );
  }, [session, loading, error, role, router]);
  if (loading || (!error && (!session || session.role !== role)))
    return (
      <main className="loading-screen" role="status">
        Abriendo tu espacio privado…
      </main>
    );
  if (error || !session)
    return (
      <main className="loading-screen">
        <div className="empty-state">
          <h1>No pudimos abrir tu espacio</h1>
          <p role="alert">{error}</p>
          <Link href="/maestro/login" className="gold-button">
            Volver al acceso
          </Link>
        </div>
      </main>
    );
  return children(session);
}
