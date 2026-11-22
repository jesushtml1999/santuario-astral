/** Chat uploads initialize Storage lazily with the authenticated participant's app. */
export const CLOUD_MEDIA_UPLOADS_ENABLED = true;
export const AVATAR_URL_REQUIRED_MESSAGE =
  "Sube la foto y guarda su URL HTTPS para el perfil.";

export function assertHostedAvatar(avatarUrl: string): void {
  if (avatarUrl.startsWith("data:"))
    throw new Error(AVATAR_URL_REQUIRED_MESSAGE);
}
