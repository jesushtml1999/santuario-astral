"use client";
import Image from "next/image";
import { Camera } from "lucide-react";
import { MASTER_SPECIALTIES, safeAvatarUrl } from "@/lib/masterValidation";
import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";

export interface ProfileFieldValues {
  bio: string;
  specialties: string[];
  avatarUrl: string;
}
export default function ProfileFields({
  value,
  onChange,
  onError,
  disabled = false,
}: {
  value: ProfileFieldValues;
  onChange: (value: ProfileFieldValues) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const localPhotosEnabled = !isFirebaseConfigured();
  async function photo(file: File | undefined) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      ) ||
      !file.size ||
      file.size > 2 * 1024 * 1024
    ) {
      onError("Selecciona una foto JPG, PNG, WebP o GIF de hasta 2 MB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error());
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      onChange({ ...value, avatarUrl: data });
    } catch {
      onError("No pudimos leer la foto seleccionada.");
    }
  }
  const avatar = safeAvatarUrl(value.avatarUrl);
  return (
    <>
      <div className="profile-photo-editor">
        {avatar ? (
          <Image
            src={avatar}
            width={82}
            height={82}
            unoptimized
            alt="Vista previa de la foto del maestro"
          />
        ) : (
          <span className="empty-avatar">
            <Camera size={25} aria-hidden="true" />
          </span>
        )}
        <label className="outline-button avatar-upload">
          <Camera size={16} aria-hidden="true" />
          {localPhotosEnabled
            ? "Elegir foto local"
            : "Carga de fotos pendiente"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={disabled || !localPhotosEnabled}
            onChange={(event) => {
              void photo(event.target.files?.[0]);
            }}
            aria-label="Cargar foto del maestro"
          />
        </label>
      </div>
      {!localPhotosEnabled && (
        <p className="field-help">
          Puedes usar una URL HTTPS para tu foto. La carga de archivos estará
          disponible al habilitar Storage.
        </p>
      )}
      <label>
        URL de la foto
        <input
          type="url"
          value={value.avatarUrl.startsWith("data:") ? "" : value.avatarUrl}
          placeholder={
            value.avatarUrl.startsWith("data:")
              ? "Imagen local seleccionada"
              : "https://…"
          }
          onChange={(event) =>
            onChange({ ...value, avatarUrl: event.target.value })
          }
          disabled={disabled}
        />
      </label>
      <fieldset className="specialties-fieldset" disabled={disabled}>
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
          placeholder="Presenta tu camino y tu forma de acompañar a los clientes…"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, bio: event.target.value })}
        />
      </label>
    </>
  );
}
