import { Suspense } from "react";
import type { Metadata } from "next";
import AdminPanel from "@/components/AdminPanel";
export const metadata: Metadata = {
  title: "Administración | Santuario Astral",
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="loading-screen">Abriendo administración…</main>
      }
    >
      <AdminPanel />
    </Suspense>
  );
}
