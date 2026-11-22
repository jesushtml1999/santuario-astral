import { Suspense } from "react";
import type { Metadata } from "next";
import MasterPanel from "@/components/MasterPanel";
export const metadata: Metadata = {
  title: "Mi panel de maestro | Santuario Astral",
  robots: { index: false, follow: false },
};
export default function MasterPanelPage() {
  return (
    <Suspense
      fallback={<main className="loading-screen">Abriendo tu panel…</main>}
    >
      <MasterPanel />
    </Suspense>
  );
}
