/** Chat uploads initialize Storage lazily with the authenticated participant's app. */
export const CLOUD_MEDIA_UPLOADS_ENABLED = true;
export const CLOUD_AVATAR_PENDING_MESSAGE =
  "Utiliza una URL HTTPS para la foto del perfil.";

export function assertHostedAvatar(avatarUrl: string): void {
  if (avatarUrl.startsWith("data:"))
    throw new Error(CLOUD_AVATAR_PENDING_MESSAGE);
}
