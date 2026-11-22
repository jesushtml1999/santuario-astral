import { Suspense } from "react";
import CatalogExperience from "@/components/CatalogExperience";

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <main className="loading-screen">Preparando tu santuario…</main>
      }
    >
      <CatalogExperience />
    </Suspense>
  );
}
