import { Suspense } from "react";
import type { Metadata } from "next";
import ChatRoomClient from "@/components/ChatRoomClient";

export const metadata: Metadata = {
  title: "Tu consulta | Santuario Astral",
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="loading-screen">Abriendo tu conversación…</main>
      }
    >
      <ChatRoomClient />
    </Suspense>
  );
}
