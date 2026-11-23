import { Suspense } from "react";
import type { Metadata } from "next";
import MasterProfileExperience from "@/components/MasterProfileExperience";

export const metadata: Metadata = {
  title: "Conoce a tu guía | Santuario Astral",
};

export default function MasterPage() {
  return (
    <Suspense
      fallback={<main className="loading-screen">Preparando el perfil…</main>}
    >
      <MasterProfileExperience />
    </Suspense>
  );
}
