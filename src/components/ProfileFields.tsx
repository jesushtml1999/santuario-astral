"use client";
import Image from "next/image";
import { Camera, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MASTER_SPECIALTIES, safeAvatarUrl } from "@/lib/masterValidation";
import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";
import CountrySelect from "@/components/CountrySelect";
import {
  avatarErrorMessage,
  uploadMasterAvatar,
  validateAvatarFile,
} from "@/lib/masterAvatar";

export interface ProfileFieldValues {
  countryCode: string;
  bio: string;
  specialties: string[];
  avatarUrl: string;
}
export default function ProfileFields({
  value,
  onChange,
  onError,
  disabled = false,
  masterId,
  onUploadingChange,
}: {
  value: ProfileFieldValues;
  onChange: (value: ProfileFieldValues) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  masterId?: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const localPhotosEnabled = !isFirebaseConfigured();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState("");
  const [failedAvatar, setFailedAvatar] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true),
    previewUrl = useRef(""),
    operation = useRef<AbortController | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      operation.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);
  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    setPreview("");
  }
  async function photo(file: File | undefined) {
    if (!file || operation.current || disabled) return;
    const abort = new AbortController();
    operation.current = abort;
    setUploading(true);
    onUploadingChange?.(true);
    setProgress(0);
    setNotice("");
    onError("");
    try {
      await validateAvatarFile(
        file,
        localPhotosEnabled ? 2 * 1024 * 1024 : undefined,
      );
      if (!active.current || abort.signal.aborted) return;
      // Decode before upload so a renamed or corrupt image never becomes the preview.
      const localUrl = URL.createObjectURL(file);
      try {
        await new Promise<void>((resolve, reject) => {
          const image = new window.Image();
          image.onload = () => resolve();
          image.onerror = () =>
            reject(
              new Error("No pudimos abrir esta imagen. Elige otro archivo."),
            );
          image.src = localUrl;
        });
      } catch (error) {
        URL.revokeObjectURL(localUrl);
        throw error;
      }
      if (!active.current || abort.signal.aborted) {
        URL.revokeObjectURL(localUrl);
        return;
      }
      clearPreview();
      previewUrl.current = localUrl;
      setPreview(localUrl);
      setFailedAvatar("");
      const uploadedUrl = localPhotosEnabled
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              typeof reader.result === "string"
                ? resolve(reader.result)
                : reject(new Error());
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
        : await uploadMasterAvatar(file, masterId, {
            signal: abort.signal,
            onProgress: (percent) => {
              if (active.current) setProgress(percent);
            },
          });
      if (active.current && !abort.signal.aborted) {
        onChange({ ...latest.current, avatarUrl: uploadedUrl });
        setNotice("Foto lista. Guarda el perfil para aplicar el cambio.");
      }
    } catch (error) {
      if (active.current && !abort.signal.aborted) {
        clearPreview();
        onError(avatarErrorMessage(error));
      }
    } finally {
      operation.current = null;
      if (active.current) {
        setUploading(false);
        onUploadingChange?.(false);
      }
    }
  }
  const avatar = preview || safeAvatarUrl(value.avatarUrl);
  const blocked = disabled || uploading;
  return (
    <>
      <CountrySelect
        value={value.countryCode}
        onChange={(countryCode) => onChange({ ...value, countryCode })}
        disabled={blocked}
      />
      <div className="profile-photo-editor">
        {avatar && avatar !== failedAvatar ? (
          <Image
            src={avatar}
            width={82}
            height={82}
            unoptimized
            alt="Vista previa de la foto del maestro"
            onError={() => setFailedAvatar(avatar)}
          />
        ) : (
          <span className="empty-avatar">
            <Camera size={25} aria-hidden="true" />
          </span>
        )}
        <label className="outline-button avatar-upload">
          {uploading ? (
            <LoaderCircle size={16} className="spin" aria-hidden="true" />
          ) : (
            <Camera size={16} aria-hidden="true" />
          )}
          {uploading ? `Subiendo foto · ${progress}%` : "Seleccionar foto"}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={blocked}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void photo(file);
            }}
            aria-label="Cargar foto del maestro"
          />
        </label>
      </div>
      {uploading && (
        <progress max={100} value={progress} aria-label="Progreso de la foto" />
      )}
      <p className="field-help" role="status" aria-live="polite">
        {uploading
          ? "Espera a que termine la subida antes de guardar."
          : notice ||
            `JPG, JPEG, PNG o WebP · Máximo ${localPhotosEnabled ? 2 : 5} MB${localPhotosEnabled ? " en demostración local" : ""}.`}
      </p>
      <label>
        URL de la foto (se completa al subir)
        <input
          type="url"
          value={value.avatarUrl.startsWith("data:") ? "" : value.avatarUrl}
          placeholder={
            value.avatarUrl.startsWith("data:")
              ? "Imagen local seleccionada"
              : "https://…"
          }
          onChange={(event) => {
            clearPreview();
            setNotice("");
            setFailedAvatar("");
            onChange({ ...value, avatarUrl: event.target.value });
          }}
          disabled={blocked}
        />
      </label>
      <fieldset className="specialties-fieldset" disabled={blocked}>
        <legend>
          Especialidades <span>Selecciona al menos una</span>
        </legend>
        <div>
          {MASTER_SPECIALTIES.map((specialty) => (
            <label key={specialty}>
              <input
                type="checkbox"
                checked={value.specialties.includes(specialty)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    specialties: event.target.checked
                      ? [...value.specialties, specialty]
                      : value.specialties.filter((item) => item !== specialty),
                  })
                }
              />
              {specialty}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Biografía
        <textarea
          rows={5}
          required
          maxLength={4000}
          value={value.bio}
          placeholder="Cuenta qué consultas atiendes y cómo trabajas…"
          disabled={blocked}
          onChange={(event) => onChange({ ...value, bio: event.target.value })}
        />
      </label>
    </>
  );
}
