import { requireStaff } from "@/lib/staffAuth";

export const AVATAR_LIMIT = 5 * 1024 * 1024;
const formats: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function validateAvatarFile(
  file: Blob,
  limit = AVATAR_LIMIT,
): Promise<string> {
  if (!formats[file.type] || !file.size || file.size > limit)
    throw new Error(
      `Selecciona una imagen JPG, JPEG, PNG o WebP de hasta ${limit / 1024 / 1024} MB.`,
    );
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (
    !(file.type === "image/jpeg"
      ? jpeg
      : file.type === "image/png"
        ? png
        : webp)
  )
    throw new Error(
      "El archivo no corresponde a una imagen JPG, PNG o WebP válida.",
    );
  return formats[file.type];
}

export function avatarErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : "";
  if (code === "storage/unauthorized" || code === "storage/unauthenticated")
    return "Tu sesión no tiene permiso para subir esta foto. Vuelve a iniciar sesión e inténtalo de nuevo.";
  if (code === "storage/retry-limit-exceeded")
    return "La subida tardó demasiado. Revisa tu conexión y vuelve a elegir la foto.";
  return error instanceof Error && !code
    ? error.message
    : "No pudimos subir la foto. Revisa tu conexión y vuelve a intentarlo.";
}

export async function uploadMasterAvatar(
  file: Blob,
  masterId?: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<string> {
  const extension = await validateAvatarFile(file);
  const session = await requireStaff();
  if (session.mode !== "firebase")
    throw new Error("Esta subida necesita una sesión de Firebase.");
  const scope =
    masterId ??
    (session.role === "maestro" ? session.masterId : `draft-${session.uid}`);
  if (
    !scope ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(scope) ||
    (session.role === "maestro" &&
      (scope !== session.masterId || scope !== session.uid))
  )
    throw new Error("No puedes subir una foto para otro maestro.");
  const { staffAuth } = await import("@/lib/staffFirebase");
  const check = () => {
    if (options.signal?.aborted)
      throw new DOMException("Subida cancelada", "AbortError");
    if (staffAuth.currentUser?.uid !== session.uid)
      throw new Error("Tu sesión cambió. Vuelve a iniciar sesión.");
  };
  check();
  const { getStorage, ref, uploadBytesResumable, getDownloadURL } =
    await import("firebase/storage");
  check();
  // A draft folder permits uploading before a new master's Auth UID exists.
  // Public URLs remain stable when the administrator saves the new profile.
  const target = ref(
    getStorage(staffAuth.app),
    `master_avatars/${scope}/${crypto.randomUUID()}.${extension}`,
  );
  const task = uploadBytesResumable(target, file, {
    contentType: file.type,
    customMetadata: { ownerUid: session.uid, masterId: scope },
  });
  await new Promise<void>((resolve, reject) => {
    let finished = false,
      unsubscribe: () => void = () => {};
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      options.signal?.removeEventListener("abort", abort);
      unsubscribe();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      task.cancel();
      finish(new DOMException("Subida cancelada", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    unsubscribe = task.on(
      "state_changed",
      (snapshot) => {
        try {
          check();
          options.onProgress?.(
            Math.round((100 * snapshot.bytesTransferred) / snapshot.totalBytes),
          );
        } catch (error) {
          task.cancel();
          finish(error);
        }
      },
      (error) => finish(error),
      () => finish(),
    );
    if (finished) unsubscribe();
    if (options.signal?.aborted) abort();
  });
  check();
  const url = await getDownloadURL(target);
  check();
  options.onProgress?.(100);
  return url;
}
