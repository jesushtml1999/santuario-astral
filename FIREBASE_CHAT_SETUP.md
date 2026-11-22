# Activar el chat con Firebase

El modo local funciona sin credenciales. Los perfiles de demostración siempre conservan sus conversaciones en el navegador, incluso si se configura Firebase.

Para usar las conversaciones reales:

1. Completar las seis variables de Firebase en `.env.local` y volver a compilar. No se requieren claves privadas ni cuentas de servicio en el navegador.
2. Habilitar **Authentication > Anonymous** en el proyecto existente y autorizar el dominio de la aplicación.
3. Habilitar Firestore y revisar `firestore.rules` antes de publicarlas. No activar Storage ni Blaze en esta etapa: la aplicación solo inicializa Auth y Firestore. Las reglas de Storage quedan preparadas para el futuro.
4. Para el acceso profesional y la creación de cuentas desde `/admin`, seguir [STAFF_SETUP.md](STAFF_SETUP.md). La asignación `users/{authUid}` con `{ role: "maestro", masterId: authUid }` y el perfil `masters/{authUid}` se crean desde el servidor de confianza. El navegador no puede otorgarse ese rol. Las asignaciones antiguas con IDs distintos requieren migración.

Cada sala real guarda `clientAuthUid`, además del identificador local `guestId`. Las reglas comprueban ese UID o la asignación del maestro para acceder a la sala, sus mensajes y sus adjuntos. Los participantes y el contexto inicial son inmutables; sala y mensaje se actualizan en una transacción.

Las salas antiguas de Firestore sin `clientAuthUid` requieren una migración desde un backend de confianza que conozca al propietario. No se permite reclamarlas desde una URL. Las conversaciones locales anteriores siguen siendo compatibles.

Las cargas remotas están deshabilitadas: los chats reales envían texto y muestran fotos/audio como pendientes. La interfaz `PendingCloudMediaAdapter` documenta la integración futura de `chat_media/{roomId}/...`. Los adjuntos locales de demostración se guardan como DataURL y admiten hasta 2 MB por archivo, sujetos al espacio disponible del navegador. Las grabaciones se limitan a dos minutos y los tracks del micrófono se cierran al cancelar, detener o abandonar la sala. El modo local sincroniza pestañas del mismo navegador, no dispositivos distintos.

Estas reglas no se despliegan automáticamente. `npm run test:rules` las comprueba con emuladores locales y las identidades cliente/maestro/admin de prueba. Antes de un despliegue real, verificar además el flujo con las identidades del proyecto. La compilación de Next.js no verifica las reglas ni sustituye esa comprobación. Ver [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md) para conexión, medición y publicación.
