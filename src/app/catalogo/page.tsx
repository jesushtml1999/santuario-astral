import { Suspense } from "react";
import VisitorCatalog from "@/components/VisitorCatalog";

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <main className="loading-screen">Preparando tu santuario…</main>
      }
    >
      <VisitorCatalog />
    </Suspense>
  );
}
