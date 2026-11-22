/** No Firebase Storage SDK is imported or initialized by this adapter. */
export const CLOUD_MEDIA_UPLOADS_ENABLED = false;
export const CLOUD_MEDIA_PENDING_MESSAGE =
  "Fotos y notas de voz pendientes de habilitar Storage. Por ahora puedes enviar texto.";
export const CLOUD_AVATAR_PENDING_MESSAGE =
  "La carga de fotos está pendiente de habilitar Storage. Utiliza una URL HTTPS para el avatar.";

// Implement and review this interface only after explicitly enabling Storage/Blaze.
export interface PendingCloudMediaAdapter {
  upload(input: {
    file: Blob;
    path: string;
    ownerUid: string;
    roomId?: string;
    signal?: AbortSignal;
  }): Promise<{ mediaUrl: string; storagePath: string }>;
}

export function rejectCloudMediaUpload(): never {
  throw new Error(CLOUD_MEDIA_PENDING_MESSAGE);
}

export function assertHostedAvatar(avatarUrl: string): void {
  if (avatarUrl.startsWith("data:"))
    throw new Error(CLOUD_AVATAR_PENDING_MESSAGE);
}
