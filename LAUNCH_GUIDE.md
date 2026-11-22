# Conectar y publicar Santuario Astral

## 1. Variables

Dentro de `santuario-astral`, completa `.env.local` usando la configuración de la **app web del proyecto Firebase elegido**:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_META_PIXEL_ID=
```

El Pixel necesita un ID numérico de tu origen de datos en Meta Events Manager. Vacío o inválido desactiva la medición; un bloqueador no impide consultar ni enviar mensajes. Las seis variables de Firebase deben estar completas; sin ellas funciona la demostración local.

Para crear accesos reales desde `/admin`, configura además **solo en el servidor** `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL` y `FIREBASE_ADMIN_PRIVATE_KEY`. La clave admite saltos de línea reales o `\n`. Alternativamente utiliza credenciales de aplicación mediante `GOOGLE_APPLICATION_CREDENTIALS` fuera del repositorio. No publiques claves privadas, `.env.local` ni cuentas de servicio en Git. Los nombres están en `.env.local.example`.

## 2. Firebase Console

1. Selecciona el proyecto correcto y registra una app web. No reemplaces el proyecto ni sus datos existentes.
2. En **Authentication → Sign-in method**, activa **Anonymous** y **Email/Password**. En dominios autorizados añade `localhost`, el dominio de pruebas y el definitivo. El visitante tendrá un UID anónimo sin formulario de registro.
3. Usa Firestore **Standard / Native mode**, base `(default)`. En `santuario-astral-v2`, Firestore y el bucket `santuario-astral-v2.firebasestorage.app` están creados en `us-east1`, con Blaze habilitado. El chat inicializa Storage al adjuntar un archivo.
4. Antes de modificar reglas remotas, guarda una copia. Publica `firestore.rules` y `storage.rules`, revisando primero las colecciones existentes. Para las consultas de Storage a Firestore, el agente de servicio de Storage necesita `roles/firebaserules.firestoreServiceAgent`. No uses reglas abiertas de modo de prueba.
5. Crea el primer usuario admin en Authentication y, desde la consola de confianza, `users/{UID}` con `{ role: "admin", displayName: "Administración", email: "correo-real", disabled: false }`. Reinicia la app y entra en `/maestro/login`. Crea los maestros reales desde `/admin`; cada uno utiliza su UID de Auth como ID de `masters/{UID}` y `users/{UID}`, con `role: "maestro"` y `masterId: UID`. Detalles en [STAFF_SETUP.md](STAFF_SETUP.md).

Las reglas permiten catálogo activo público, edición limitada del propio perfil y supervisión de lectura del admin. Crear roles y eliminar cuentas/perfiles pasa por el servidor. Los clientes solo acceden a salas cuyo `clientAuthUid` coincide con su UID; los maestros necesitan un rol habilitado y `masterId == request.auth.uid`. Un `guestId` o una URL no otorgan acceso. Las salas antiguas sin propietario o maestros con IDs diferentes del UID requieren migración de confianza antes de usar estas reglas.

Los 20 perfiles iniciales son ficticios y no se convierten automáticamente en cuentas reales. Crea perfiles reales antes de lanzar anuncios. Cuando exista un catálogo real, ocultar todos los perfiles lo deja vacío. Las salas locales permanecen en ese navegador y no se migran automáticamente a Firestore.

## 3. Prueba completa

Usa Node.js **24.12 o posterior de la rama 24**. Para emuladores necesitas Java 21 o posterior disponible en `PATH`:

Se fija `jose@5.10.0` únicamente dentro de `jwks-rsa` para evitar el error `ERR_REQUIRE_ESM` de Firebase Admin en funciones de Vercel. La prueba `firebase-admin-runtime.test.mjs` comprueba la carga y la validación criptográfica de claves en CommonJS. Mantén este override hasta que la dependencia corrija su compatibilidad: [incidencia de Firebase Admin](https://github.com/firebase/firebase-admin-node/issues/3181).

```sh
npm ci
npm run lint
npm test
npm run test:rules
npm run build
npm run dev
```

`test:rules` usa exclusivamente el proyecto local `demo-santuario-astral`, puertos 8088/9198 y datos desechables; no necesita credenciales remotas ni publica reglas. La primera ejecución descarga los emuladores oficiales. [Documentación de los emuladores](https://firebase.google.com/docs/emulator-suite/install_and_configure).

En el navegador:

1. Abre `/catalogo` sin sesión de personal; revela la carta del día y recarga para comprobar que se conserva. Abre un perfil.
2. Envía el modal con nombre/apodo y una pregunta de prueba. Comprueba el mensaje inicial y envía texto, una imagen (máximo 5 MB) y audio (máximo 8 MB). Verifica progreso, cancelación, recepción en otro dispositivo y reintentos sin mensajes duplicados. La demostración local conserva sus adjuntos únicamente en el navegador. Prueba otro maestro y otro navegador privado: sus historiales deben estar separados.
3. En otra pestaña inicia sesión como ese maestro. Revisa solo su bandeja, no leídos y etiquetas. Abre el chat, inserta una respuesta rápida y responde con texto. Comprueba recepción y lectura. Cambia disponibilidad y biografía; elige una foto JPG/JPEG, PNG o WebP de hasta 5 MB, espera la subida y guarda el perfil. Confirma el cambio público. Repite desde administración al editar y al crear un maestro; verifica que no permite guardar mientras sube la foto y que puedes reintentar si falla.
4. Cierra sesión, entra como admin y crea un maestro extra. Comprueba acceso, visibilidad, edición y ocultación. Eliminar está reservado a perfiles de prueba sin conversaciones; los demás conservan historial al ocultarse.
5. Con tu Pixel configurado y sin bloqueadores, revisa **Events Manager → Test Events** o **Meta Pixel Helper**:

   | Acción                                           | Evento                                               |
   | ------------------------------------------------ | ---------------------------------------------------- |
   | Carga/navegación de páginas del cliente          | `PageView`                                           |
   | Perfil disponible                                | `ViewContent`                                        |
   | Modal guardado correctamente                     | `StartConsultation` (personalizado)                  |
   | Primer envío exitoso del cliente dentro del chat | `FirstMessageSent` (personalizado, una vez por sala) |

   El mensaje del modal no cuenta como ese primer envío desde el chat. Las rutas de login/panel/admin no disparan eventos del embudo. Los eventos personalizados usan una referencia aleatoria de conversación y no incluyen nombre del visitante, fecha/signo, pregunta, mensajes ni adjuntos. `demo_mode: true` identifica las pruebas locales/ejemplos: exclúyelas de conversiones de campañas. No actives coincidencias avanzadas ni eventos automáticos que recojan campos del formulario. El SDK de Meta puede añadir URL y datos del navegador; no añadas información personal a las URLs y configura los avisos/consentimientos que correspondan antes de activar publicidad. [Eventos de Meta](https://developers.facebook.com/documentation/meta-pixel/implementation/conversion-tracking).

## 4. Publicación

En Vercel, importa el repositorio, selecciona **Next.js**, raíz `santuario-astral` si el repositorio contiene la carpeta superior, y **Node.js 24.x**. Usa `npm run build` y la salida automática de Next.js. Configura las variables anteriores para el entorno correcto: las públicas al compilar y las del Admin SDK únicamente en el servidor. Cada cambio de variables públicas requiere un nuevo despliegue. [Next.js en Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [variables de entorno](https://vercel.com/docs/environment-variables).

En otro hosting utiliza soporte completo de Next.js y servidor Node (`npm run build` + `npm start`), incluidos los Route Handlers de `/api/admin/masters`; una exportación estática no ejecuta esa administración. Comprueba la URL de preview antes de promover a producción, añade el dominio HTTPS a Firebase Auth y repite el flujo en dos dispositivos. Cámara/micrófono requieren HTTPS o localhost. Guarda el despliegue anterior para poder revertir el código; restaura por separado las reglas si cambian.

La preparación del código no publica la web, reglas ni campañas. La recepción real del Pixel y el flujo entre dispositivos se verifican al disponer de tus credenciales y dominio. Antes de producción revisa también `npm audit --omit=dev`: el SDK Firebase instalado conserva avisos de seguridad heredados; no apliques actualizaciones forzadas sin comprobar compatibilidad.

## Migración a v2

El respaldo privado `.env.migration-v2-source.json` contiene 46 documentos y 26 usuarios del proyecto anterior: 20 maestros, 21 roles, configuración pública y una sala con tres mensajes. Incluye información privada y hashes de contraseña; está ignorado por Git, igual que `.env.v2-admin-credential.json` y `.env.local`.

`node scripts/migrate-firebase-v2.mjs --check` muestra el inventario sin importar nada. El procedimiento revisable con `--apply` conserva UID, contraseñas cifradas, estado habilitado y roles; compara cada destino y rechaza sobrescrituras de datos diferentes. No borra ni modifica el proyecto anterior. El propietario original debe tener sesión activa en Firebase CLI para leer los parámetros de contraseña, que permanecen en memoria. El respaldo representa un momento concreto: antes del cambio definitivo, comprobar si el proyecto anterior recibió nuevos usuarios o mensajes y refrescar el respaldo si hace falta.

La importación se completó el 22 de noviembre de 2026: se verificaron los 46 documentos y los 26 usuarios, incluidas las contraseñas cifradas de las dos cuentas con acceso. El informe local queda en `.firebase/migration-v2-report.json`. El usuario confirmó conservar el historial y permitir consultas nuevas al cliente anónimo; las sesiones anónimas del proyecto anterior no se trasladan al navegador de v2. Maestros y admin tendrán que iniciar sesión de nuevo.

El entorno local utiliza la cuenta de servicio `santuario-vercel@santuario-astral-v2.iam.gserviceaccount.com`, con `roles/firebaseauth.admin` y `roles/datastore.user`. En Vercel se actualizaron las seis variables `NEXT_PUBLIC_FIREBASE_*` como Config para Production/Preview y las tres `FIREBASE_ADMIN_*` como Secret para Production. El proyecto utiliza Node.js 24. `NEXT_PUBLIC_META_PIXEL_ID` sigue pendiente. Mantener la producción anterior hasta comprobar la importación, los accesos y un despliegue de prueba con v2.

`.gitignore` protege las credenciales del repositorio y `.vercelignore` las excluye explícitamente del paquete que sube la CLI, incluyendo todos los respaldos `.env*` y los informes `.firebase`. Antes de desplegar, `vercel deploy --dry --json` permite comprobar la lista efectiva de archivos sin subirlos.
