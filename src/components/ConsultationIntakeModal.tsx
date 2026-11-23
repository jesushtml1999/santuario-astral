"use client";

import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageCircle, Moon, Sparkles } from "lucide-react";
import AstralModal from "@/components/AstralModal";
import {
  getGuestLeadData,
  getOrCreateGuestId,
  saveGuestLeadData,
} from "@/lib/guestSession";
import { startConsultation } from "@/lib/consultations";
import { trackStartConsultation } from "@/lib/metaPixel";
import type { ClientLeadData, MasterProfile } from "@/types";

export default function ConsultationIntakeModal({
  master,
  isDemo,
  onClose,
}: {
  master: MasterProfile;
  isDemo: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [savedLead] = useState(getGuestLeadData);
  const [name, setName] = useState(savedLead?.name ?? "");
  const [zodiac, setZodiac] = useState(savedLead?.birthDateOrSign ?? "");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const requestId = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!name.trim() || !topic.trim()) {
      setError("Escribe tu nombre y la pregunta que deseas compartir.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const guestId = getOrCreateGuestId();
      if (!guestId)
        throw new Error(
          "Abre esta consulta desde tu navegador para continuar.",
        );
      const lead: ClientLeadData = {
        guestId,
        name: name.trim(),
        initialTopic: topic.trim(),
        ...(zodiac.trim() ? { birthDateOrSign: zodiac.trim() } : {}),
      };
      saveGuestLeadData(lead);
      requestId.current ??= window.crypto.randomUUID();
      const roomId = await startConsultation(master, lead, {
        isDemo,
        requestId: requestId.current,
      });
      // Close before Next.js preserves this route's state for a return visit.
      trackStartConsultation(master.id, master.name, roomId);
      flushSync(onClose);
      router.push(`/chat/${encodeURIComponent(roomId)}`);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error && !cause.name.includes("Firebase")
          ? cause.message
          : "No pudimos iniciar tu consulta. Revisa tu conexión e inténtalo de nuevo.",
      );
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <AstralModal
      title={
        savedLead ? "¿Qué quieres consultar hoy?" : "Cuéntanos tu pregunta"
      }
      onClose={onClose}
      busy={busy}
    >
      <p className="modal-intro">
        {savedLead
          ? "Revisa tus datos y escribe tu pregunta para esta consulta."
          : `Vas a escribir a ${master.name}. Indica cómo quieres que te llame y qué necesitas consultar.`}
      </p>
      {isDemo && (
        <p className="intake-demo">
          <Sparkles size={15} aria-hidden="true" /> Consulta de demostración. Se
          guardará en este navegador y no se enviará a un maestro real.
        </p>
      )}
      <form onSubmit={submit} className="intake-form">
        <fieldset disabled={busy}>
          <label htmlFor="intake-name">
            Nombre o apodo <span aria-hidden="true">*</span>
          </label>
          <input
            id="intake-name"
            name="name"
            autoComplete="nickname"
            required
            maxLength={80}
            placeholder="¿Cómo te gustaría que te llamen?"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label htmlFor="intake-zodiac">
            Fecha de nacimiento o signo{" "}
            <span className="optional-label">Opcional</span>
          </label>
          <div className="input-with-icon">
            <Moon size={16} aria-hidden="true" />
            <input
              id="intake-zodiac"
              name="birthDateOrSign"
              maxLength={80}
              placeholder="Ej. 15/06/1992 o Géminis"
              value={zodiac}
              onChange={(event) => setZodiac(event.target.value)}
            />
          </div>
          <label htmlFor="intake-topic">
            Tu motivo de consulta o primera pregunta{" "}
            <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="intake-topic"
            name="initialTopic"
            required
            rows={4}
            maxLength={2000}
            placeholder="Escribe lo que quieres consultar…"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            aria-describedby="intake-topic-help"
          />
          <p id="intake-topic-help" className="field-help">
            Esta pregunta será tu primer mensaje a {master.name}.
          </p>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="gold-button intake-submit"
          type="submit"
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" aria-hidden="true" />
          ) : (
            <MessageCircle size={18} aria-hidden="true" />
          )}
          {busy ? "Preparando tu consulta…" : "Comenzar mi consulta"}
        </button>
        <p className="intake-privacy">
          Usaremos estos datos para identificar tu consulta. Tu nombre y signo
          quedarán guardados para tus próximas visitas.
        </p>
      </form>
    </AstralModal>
  );
}
