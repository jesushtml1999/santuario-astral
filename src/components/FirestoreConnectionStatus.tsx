"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CloudOff,
  Database,
  LoaderCircle,
  RotateCw,
} from "lucide-react";
import {
  checkFirestoreConnection,
  type FirestoreConnectionResult,
} from "@/lib/firestoreConnection";

export default function FirestoreConnectionStatus() {
  const [result, setResult] = useState<FirestoreConnectionResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void checkFirestoreConnection().then((value) => {
      if (active) setResult(value);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const title = !result
    ? "Comprobando conexión…"
    : result.status === "connected"
      ? "Firestore conectado"
      : result.status === "not-configured"
        ? "Vista de demostración"
        : "Conexión pendiente";
  const description = !result
    ? "Verificando la lectura del catálogo."
    : result.status === "connected"
      ? result.hasMasters
        ? "El catálogo remoto está disponible."
        : "La conexión funciona. Aún no hay maestros activos en Firestore."
      : result.status === "not-configured"
        ? "Puedes explorar los ejemplos. Completa las variables de Firebase para conectar el catálogo."
        : result.reason === "permissions"
          ? "Revisa las reglas de lectura del catálogo en Firebase. Puedes seguir explorando los ejemplos disponibles."
          : "No pudimos verificar Firestore ahora. Revisa tu conexión e inténtalo de nuevo.";
  const Icon = !result
    ? LoaderCircle
    : result.status === "connected"
      ? CheckCircle2
      : result.status === "not-configured"
        ? Database
        : CloudOff;
  return (
    <section
      className="firestore-connection"
      aria-label="Estado de conexión con Firestore"
    >
      <Icon
        size={19}
        aria-hidden="true"
        className={!result ? "spin" : undefined}
      />
      <div role="status">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {result?.status === "unavailable" && (
        <button
          type="button"
          className="outline-button"
          onClick={() => {
            setResult(null);
            setAttempt((value) => value + 1);
          }}
        >
          <RotateCw size={15} aria-hidden="true" /> Reintentar
        </button>
      )}
    </section>
  );
}
