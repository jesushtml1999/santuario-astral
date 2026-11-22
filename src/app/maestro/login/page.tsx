import { Suspense } from "react";
import type { Metadata } from "next";
import StaffLogin from "@/components/StaffLogin";
export const metadata: Metadata = {
  title: "Acceso de maestros y administración | Santuario Astral",
  robots: { index: false, follow: false },
};
export default function LoginPage() {
  return (
    <Suspense
      fallback={<main className="loading-screen">Abriendo el acceso…</main>}
    >
      <StaffLogin />
    </Suspense>
  );
}
