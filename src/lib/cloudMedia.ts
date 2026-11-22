import type { Auth } from "firebase/auth";

function checkSession(auth: Auth, ownerUid: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Envío cancelado", "AbortError");
  if (auth.currentUser?.uid !== ownerUid)
    throw new Error("Tu sesión cambió. Vuelve a abrir la conversación.");
}

/** Immutable message paths allow a failed Firestore send to reuse its upload. */
export async function uploadChatMedia(input: {
  auth: Auth;
  file: Blob;
  roomId: string;
  messageId: string;
  ownerUid: string;
  contentType: string;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}): Promise<{ mediaUrl: string; storagePath: string }> {
  const { auth, file, roomId, messageId, ownerUid, contentType, signal } =
    input;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[a-z0-9_-]{1,128}$/i.test(
      roomId,
    ) ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(messageId)
  )
    throw new Error("No pudimos identificar el archivo de esta conversación.");
  checkSession(auth, ownerUid, signal);
  const { getStorage, ref, getMetadata, getDownloadURL, uploadBytesResumable } =
    await import("firebase/storage");
  checkSession(auth, ownerUid, signal);
  const storagePath = `chat_media/${roomId}/${messageId}`;
  const reference = ref(getStorage(auth.app), storagePath);
  let exists = false;
  try {
    const metadata = await getMetadata(reference);
    if (
      metadata.customMetadata?.ownerUid !== ownerUid ||
      metadata.customMetadata?.roomId !== roomId ||
      metadata.size !== file.size ||
      metadata.contentType !== contentType
    )
      throw new Error("Este archivo ya pertenece a otro envío.");
    exists = true;
  } catch (error) {
    if (!(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "storage/object-not-found"
    ))
      throw error;
  }
  checkSession(auth, ownerUid, signal);
  if (!exists) {
    const task = uploadBytesResumable(reference, file, {
      contentType,
      customMetadata: { ownerUid, roomId },
    });
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let unsubscribe: () => void = () => {};
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", abort);
        unsubscribe();
        if (error) reject(error);
        else resolve();
      };
      const abort = () => {
        task.cancel();
        finish(new DOMException("Envío cancelado", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      unsubscribe = task.on(
        "state_changed",
        (snapshot) => {
          try {
            checkSession(auth, ownerUid, signal);
            input.onProgress?.(
              Math.round(
                (100 * snapshot.bytesTransferred) / snapshot.totalBytes,
              ),
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
      if (signal?.aborted) abort();
    });
  }
  checkSession(auth, ownerUid, signal);
  const mediaUrl = await getDownloadURL(reference);
  checkSession(auth, ownerUid, signal);
  input.onProgress?.(100);
  return { mediaUrl, storagePath };
}
