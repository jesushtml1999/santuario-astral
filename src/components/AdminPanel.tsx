"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import StaffGate from "@/components/StaffGate";
import StaffShell from "@/components/StaffShell";
import AstralModal from "@/components/AstralModal";
import ProfileFields, {
  type ProfileFieldValues,
} from "@/components/ProfileFields";
import {
  getMasterDirectory,
  saveManagedMaster,
  setMasterVisibility,
  deleteTestMaster,
} from "@/lib/staffService";
import { MASTERS_CHANGED } from "@/lib/localMasters";
import { STAFF_CHANGED } from "@/lib/staffAuth";
import type { MasterDirectoryEntry, StaffSession } from "@/types/staff";

function MasterEditor({
  entry,
  session,
  onClose,
  onSaved,
}: {
  entry?: MasterDirectoryEntry;
  session: StaffSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(entry?.profile.name ?? "");
  const [years, setYears] = useState(
    String(entry?.profile.experienceYears ?? 0),
  );
  const [fields, setFields] = useState<ProfileFieldValues>({
    bio: entry?.profile.bio ?? "",
    avatarUrl: entry?.profile.avatarUrl ?? "",
    specialties:
      entry?.profile.specialties ?? (entry ? [entry.profile.specialty] : []),
  });
  const [login, setLogin] = useState(entry?.login ?? "");
  const [password, setPassword] = useState("");
  const accessPending =
    session.mode === "firebase" && entry?.accessPending === true;
  const [test, setTest] = useState(
    session.mode === "local" || entry?.profile.isTestProfile === true,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await saveManagedMaster(
        {
          ...fields,
          name,
          experienceYears: Number(years),
          login,
          password: password || undefined,
          isTestProfile: test,
        },
        entry?.profile.id,
        accessPending,
      );
      setPassword("");
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos guardar el maestro.",
      );
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <AstralModal
      title={entry ? "Editar maestro" : "Crear un nuevo maestro"}
      onClose={onClose}
      busy={busy}
    >
      <p className="modal-intro">
        {accessPending
          ? "Este perfil aún no tiene acceso de maestro. Puedes editarlo y mostrarlo u ocultarlo en el catálogo sin foto, correo ni contraseña. Para que el maestro inicie sesión y responda sus chats, completa correo y contraseña. Los perfiles de prueba se identifican como ejemplos en la web pública."
          : entry
          ? "Actualiza el perfil y su acceso. Deja la contraseña vacía para conservar la actual."
          : "Añade un perfil y su cuenta de acceso. Podrás crear más maestros cuando los necesites."}
      </p>
      <form onSubmit={submit} className="staff-form editor-form">
        <fieldset disabled={busy}>
          <label>
            Nombre del maestro
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Años de experiencia
            <input
              type="number"
              required
              min={0}
              max={100}
              value={years}
              onChange={(event) => setYears(event.target.value)}
            />
          </label>
          <ProfileFields
            value={fields}
            onChange={setFields}
            onError={setError}
            disabled={busy}
          />
          <div className="editor-section-heading">Acceso del maestro</div>
          <label>
            {session.mode === "local"
              ? "Correo o usuario de acceso"
              : "Correo de acceso"}
            <input
              autoComplete="off"
              type={session.mode === "local" ? "text" : "email"}
              required={!accessPending || !!password}
              maxLength={160}
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
          </label>
          <label>
            {accessPending
              ? "Contraseña para habilitar el acceso"
              : entry ? "Nueva contraseña (opcional)" : "Contraseña de acceso"}
            <input
              type="password"
              autoComplete="new-password"
              required={!entry || (accessPending && !!login.trim())}
              minLength={session.mode === "local" ? 8 : 12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                entry && !accessPending
                  ? "Conservar la contraseña actual"
                  : `Mínimo ${session.mode === "local" ? 8 : 12} caracteres`
              }
            />
          </label>
          <label className="test-profile-check">
            <input
              type="checkbox"
              checked={test}
              disabled={session.mode === "local"}
              onChange={(event) => setTest(event.target.checked)}
            />
            Perfil de prueba (permite eliminarlo si no tiene chats)
          </label>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="gold-button" type="submit" disabled={busy}>
          {busy && (
            <LoaderCircle size={16} className="spin" aria-hidden="true" />
          )}
          {busy ? "Guardando…" : entry ? "Guardar cambios" : "Crear maestro"}
        </button>
      </form>
    </AstralModal>
  );
}

function Directory({ session }: { session: StaffSession }) {
  const [entries, setEntries] = useState<MasterDirectoryEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(20);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<MasterDirectoryEntry | "new" | null>(
    null,
  );
  const [removing, setRemoving] = useState<MasterDirectoryEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true,
      request = 0;
    const refresh = () => {
      const current = ++request;
      void getMasterDirectory().then(
        (page) => {
          if (active && current === request) {
            setEntries(page.entries);
            setCursor(page.nextCursor);
            setError("");
          }
        },
        (cause) => {
          if (active) {
            setEntries(null);
            setError(
              cause instanceof Error
                ? cause.message
                : "No pudimos leer el directorio.",
            );
          }
        },
      );
    };
    refresh();
    const stops: Array<() => void> = [];
    if (session.mode === "local") {
      for (const event of [MASTERS_CHANGED, STAFF_CHANGED, "storage"]) {
        window.addEventListener(event, refresh);
        stops.push(() => window.removeEventListener(event, refresh));
      }
    } else
      void Promise.all([
        import("@/lib/staffFirebase"),
        import("firebase/firestore"),
      ]).then(([{ staffDb }, { doc, onSnapshot }]) => {
        if (active)
          stops.push(
            onSnapshot(
              doc(staffDb, "publicConfig", "catalog"),
              refresh,
              () => {},
            ),
          );
      });
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [session.mode, refreshKey]);
  const visible = (entries ?? []).filter(({ profile, login }) =>
    `${profile.name} ${profile.specialty} ${login}`
      .toLocaleLowerCase("es")
      .includes(search.toLocaleLowerCase("es")),
  );
  async function visibility(entry: MasterDirectoryEntry) {
    setBusy(true);
    setError("");
    try {
      await setMasterVisibility(entry.profile.id, !entry.profile.isActive);
      setNotice(
        entry.profile.isActive
          ? "Perfil oculto en el catálogo."
          : "Perfil visible en el catálogo.",
      );
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos actualizar la visibilidad.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError("");
    try {
      await deleteTestMaster(removing.profile.id);
      setRemoving(null);
      setNotice("Perfil de prueba eliminado.");
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setRemoving(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos eliminar el perfil.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor) {
      setShown((value) => value + 20);
      return;
    }
    setBusy(true);
    try {
      const page = await getMasterDirectory(cursor);
      setEntries((value) => [
        ...(value ?? []),
        ...page.entries.filter(
          (entry) =>
            !value?.some((item) => item.profile.id === entry.profile.id),
        ),
      ]);
      setCursor(page.nextCursor);
      setShown((value) => value + 50);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos cargar más perfiles.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <StaffShell session={session}>
      <section className="staff-page-heading">
        <div>
          <span className="eyebrow">UN SANTUARIO QUE SIGUE CRECIENDO</span>
          <h1>Directorio de maestros</h1>
          <p>Crea y gestiona los perfiles que dan vida a cada encuentro.</p>
        </div>
        <button className="gold-button" onClick={() => setEditor("new")}>
          <Plus size={18} aria-hidden="true" />
          Crear maestro
        </button>
      </section>
      <div className="directory-overview">
        <span>
          <Users size={20} aria-hidden="true" />
          <strong>{entries?.length ?? "—"}</strong> perfiles cargados
        </span>
        <span>
          <strong>
            {entries?.filter((entry) => entry.profile.isActive).length ?? "—"}
          </strong>{" "}
          visibles
        </span>
        <span>
          <strong>
            {entries?.filter((entry) => !entry.profile.isActive).length ?? "—"}
          </strong>{" "}
          ocultos
        </span>
      </div>
      <div className="directory-toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Filtrar perfiles cargados</span>
          <input
            type="search"
            placeholder="Filtrar por nombre, especialidad o acceso…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setShown(20);
            }}
          />
        </label>
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          Actualizar
        </button>
      </div>
      {notice && (
        <p className="staff-success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!entries && !error ? (
        <p role="status">Preparando el directorio…</p>
      ) : (
        <>
          <div className="admin-master-grid">
            {visible.slice(0, shown).map((entry) => (
              <article className="admin-master-card" key={entry.profile.id}>
                <div>
                  <span
                    className={`directory-status ${entry.profile.isActive ? "visible" : ""}`}
                  >
                    {entry.profile.isActive ? "Visible en catálogo" : "Oculto"}
                  </span>
                  {entry.accessPending ? (
                    <span className="staff-test-badge">ACCESO PENDIENTE</span>
                  ) : entry.profile.isTestProfile && (
                    <span className="staff-test-badge">PRUEBA</span>
                  )}
                </div>
                <h2>{entry.profile.name}</h2>
                <p>
                  {(
                    entry.profile.specialties ?? [entry.profile.specialty]
                  ).join(" · ")}
                </p>
                <span className="master-login-label">
                  {entry.accessPending
                    ? "Configura correo y contraseña desde Editar"
                    : entry.login || "Sin acceso asignado"}
                </span>
                <span className="directory-experience">
                  {entry.profile.experienceYears} años de experiencia
                </span>
                <div className="admin-card-actions">
                  <button
                    className="outline-button"
                    disabled={busy}
                    onClick={() => setEditor(entry)}
                    aria-label={`Editar a ${entry.profile.name}`}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    Editar
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`${entry.profile.isActive ? "Ocultar" : "Mostrar"} a ${entry.profile.name} en catálogo`}
                    onClick={() => {
                      void visibility(entry);
                    }}
                  >
                    {entry.profile.isActive ? (
                      <EyeOff size={18} aria-hidden="true" />
                    ) : (
                      <Eye size={18} aria-hidden="true" />
                    )}
                  </button>
                  {entry.profile.isTestProfile && (
                    <button
                      className="icon-button danger-icon"
                      disabled={busy}
                      onClick={() => setRemoving(entry)}
                      aria-label={`Eliminar perfil de prueba ${entry.profile.name}`}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!visible.length && entries && (
            <div className="empty-state">
              <Users size={30} aria-hidden="true" />
              <h2>No hay perfiles para mostrar</h2>
              <p>Crea un maestro o ajusta el filtro del directorio.</p>
            </div>
          )}
          {(visible.length > shown || cursor) && (
            <button
              className="outline-button load-more-staff"
              disabled={busy}
              onClick={() => {
                void more();
              }}
            >
              {busy ? "Cargando…" : "Cargar más perfiles"}
            </button>
          )}
        </>
      )}
      {editor && (
        <MasterEditor
          entry={editor === "new" ? undefined : editor}
          session={session}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice(
              editor === "new"
                ? "Maestro y acceso creados. Ya puedes gestionar su perfil."
                : "Datos del maestro actualizados.",
            );
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
      {removing && (
        <AstralModal
          title="Eliminar perfil de prueba"
          onClose={() => setRemoving(null)}
          busy={busy}
        >
          <p className="modal-intro">
            Se eliminarán el perfil de {removing.profile.name} y su acceso de
            prueba. Los perfiles con conversaciones deben ocultarse para
            conservar su historial.
          </p>
          <div className="continuation-actions">
            <button
              className="gold-button"
              disabled={busy}
              onClick={() => {
                void remove();
              }}
            >
              {busy ? "Eliminando…" : "Eliminar este perfil de prueba"}
            </button>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Conservar perfil
            </button>
          </div>
        </AstralModal>
      )}
    </StaffShell>
  );
}
export default function AdminPanel() {
  return (
    <StaffGate role="admin">
      {(session) => <Directory key={session.uid} session={session} />}
    </StaffGate>
  );
}
