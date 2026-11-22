"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  KeyRound,
  LoaderCircle,
  Moon,
  Sparkles,
} from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";
import {
  signInStaff,
  initializeDemoStaff,
  readLocalStaffAccounts,
  DEMO_ADMIN_LOGIN,
  DEMO_ADMIN_PASSWORD,
  DEMO_MASTER_PASSWORD,
} from "@/lib/staffAuth";
import { useStaffSession } from "@/hooks/useStaffSession";

export default function StaffLogin() {
  const router = useRouter();
  const { session, loading } = useStaffSession();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<
    Array<{ login: string; name: string }>
  >([]);
  const [selected, setSelected] = useState("");
  const submitting = useRef(false);
  const demo = !isFirebaseConfigured();
  useEffect(() => {
    if (!loading && session)
      router.replace(session.role === "admin" ? "/admin" : "/maestro/panel");
  }, [session, loading, router]);
  useEffect(() => {
    let active = true;
    if (demo)
      void initializeDemoStaff().then(
        () => {
          if (active) {
            const masters = readLocalStaffAccounts()
              .filter((account) => account.role === "maestro")
              .map((account) => ({
                login: account.email,
                name: account.displayName,
              }));
            setChoices(masters);
            setSelected(masters[0]?.login ?? "");
          }
        },
        () => {
          if (active)
            setError(
              "No pudimos preparar los accesos de prueba. Permite el almacenamiento de este navegador.",
            );
        },
      );
    return () => {
      active = false;
    };
  }, [demo]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const staff = await signInStaff(login, password);
      setPassword("");
      router.replace(staff.role === "admin" ? "/admin" : "/maestro/panel");
    } catch (cause) {
      setError(
        cause instanceof Error && !cause.name.includes("Firebase")
          ? cause.message
          : "No pudimos iniciar sesión. Revisa el correo, la contraseña y tu conexión.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="astral-shell staff-login-page">
      <div className="login-container">
        <Link href="/catalogo" className="back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          Volver al santuario
        </Link>
        <div className="staff-login-card">
          <div className="login-moon">
            <Moon size={32} strokeWidth={1.1} aria-hidden="true" />
            <Sparkles size={16} aria-hidden="true" />
          </div>
          <span className="eyebrow">SANTUARIO ASTRAL</span>
          <h1>Tu espacio de conexión</h1>
          <p>
            Accede como maestro o administrador y continúa acompañando cada
            camino.
          </p>
          <form onSubmit={submit} className="staff-form">
            <label htmlFor="staff-login">Correo o usuario de acceso</label>
            <input
              id="staff-login"
              name="username"
              autoComplete="username"
              required
              maxLength={160}
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="tu@correo.com"
              disabled={busy}
            />
            <label htmlFor="staff-password">Contraseña</label>
            <input
              id="staff-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tu clave de acceso"
              disabled={busy}
            />
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button type="submit" className="gold-button" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} aria-hidden="true" />
              ) : (
                <KeyRound size={17} aria-hidden="true" />
              )}
              {busy ? "Entrando a tu espacio…" : "Iniciar sesión"}
            </button>
          </form>
        </div>
        {demo && (
          <section className="demo-access-card">
            <span className="eyebrow">
              <Sparkles size={14} aria-hidden="true" /> ACCESOS DE DEMOSTRACIÓN
            </span>
            <p>
              Prueba ambos paneles. Estas claves son únicamente para el modo
              local.
            </p>
            <label htmlFor="demo-master">Maestro de prueba</label>
            <select
              id="demo-master"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {choices.map((choice) => (
                <option key={choice.login} value={choice.login}>
                  {choice.name}
                </option>
              ))}
            </select>
            <div className="demo-access-actions">
              <button
                type="button"
                className="outline-button"
                disabled={!selected || busy}
                onClick={() => {
                  setLogin(selected);
                  setPassword(DEMO_MASTER_PASSWORD);
                }}
              >
                Usar acceso de maestro
              </button>
              <button
                type="button"
                className="outline-button"
                disabled={busy}
                onClick={() => {
                  setLogin(DEMO_ADMIN_LOGIN);
                  setPassword(DEMO_ADMIN_PASSWORD);
                }}
              >
                Usar acceso de admin
              </button>
            </div>
            <small>
              Maestros: {DEMO_MASTER_PASSWORD}
              <br />
              Admin: {DEMO_ADMIN_LOGIN} · {DEMO_ADMIN_PASSWORD}
            </small>
          </section>
        )}
      </div>
    </div>
  );
}
