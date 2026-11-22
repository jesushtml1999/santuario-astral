# Acceso de maestros y administración

## Probar sin Firebase

Abre `/maestro/login`. Los botones de demostración rellenan el formulario; pulsa **Iniciar sesión** para entrar.

| Rol           | Correo                              | Contraseña de demostración |
| ------------- | ----------------------------------- | -------------------------- |
| Admin         | `admin@demo.santuario.test`         | `SantuarioDemo2026!`       |
| Luna Valencia | `luna-valencia@demo.santuario.test` | `AstralDemo2026!`          |

El selector permite elegir cualquiera de los 20 maestros iniciales. Todos estos perfiles, reseñas y accesos son ficticios. Los nuevos perfiles empiezan sin valoraciones ni reseñas.

El administrador puede crear más perfiles, cambiar sus datos y accesos, ocultarlos o eliminar perfiles de prueba sin conversaciones. Ocultar conserva el acceso del maestro y su historial. Los perfiles con chats se conservan: utiliza la opción de ocultar.

Los perfiles y contraseñas derivadas con PBKDF2 se guardan en `localStorage`; la sesión del personal usa `sessionStorage`. Cada pestaña puede tener su propia sesión. Los cambios de disponibilidad, perfil y mensajes se sincronizan entre pestañas del mismo navegador. No hay un límite de perfiles impuesto por la aplicación, aunque el almacenamiento del navegador tiene una cuota y no sincroniza dispositivos. Este modo es una demostración manipulable desde el navegador y no sirve como autorización de producción.

El maestro ve solo las salas asignadas a su `masterId`, puede etiquetarlas y editar su disponibilidad, foto, biografía y especialidades. Las respuestas rápidas se insertan en el borrador editable; requieren pulsar enviar. Cerrar sesión de personal conserva la identidad y los chats del visitante.

## Configurar Firebase real

En `santuario-astral` ya están habilitados Anonymous y Email/Password, con `santuario-astral.vercel.app` y `localhost` autorizados. El servidor de producción en Vercel usa una cuenta de servicio dedicada con permisos de Authentication y Firestore; no tiene permisos de Storage. Las credenciales se guardan como secretos de producción y en `.env.local` ignorado por Git.

Los nombres, correos, especialidades y demás datos se gestionan desde `/admin`. Cada acceso nuevo debe usar un correo real y una contraseña única de al menos 12 caracteres. Los ejemplos ficticios no son cuentas reales ni reciben roles automáticamente.

### Los 20 borradores iniciales

La visibilidad del catálogo (`masters/{UID}.isActive`) es independiente del acceso privado del maestro. Un perfil puede publicarse sin foto, correo ni contraseña; una foto vacía muestra sus iniciales. Desde **Editar** puedes guardar nombres y datos dejando correo y contraseña vacíos. Para habilitar el inicio de sesión y las respuestas del maestro, completa ambos. Publicar u ocultar un perfil no cambia su cuenta de Authentication ni su rol privado.

Los perfiles iniciales se crean ocultos y luego se publican mediante el comando siguiente. Sus cuentas reservadas y roles privados siguen deshabilitados hasta configurar el acceso. Las reseñas, valoraciones y años de experiencia empiezan en cero, y las fotos quedan vacías para sustituirlas por datos reales. Los perfiles marcados como prueba se identifican como ejemplos en el catálogo y el perfil público; puedes editar esa marca desde el panel cuando los datos correspondan al maestro real. Storage sigue pendiente.

La carga es idempotente y conserva cambios existentes. Solo desde una terminal de confianza con credenciales privadas:

```sh
node --env-file=.env.local scripts/seed-initial-masters.mjs --project=santuario-astral
node --env-file=.env.local scripts/publish-initial-masters.mjs --project=santuario-astral
```

El comando de publicación verifica los 20 identificadores iniciales y cambia únicamente su visibilidad. Conserva nombres, fotos, biografías, credenciales y conversaciones existentes; no publica otros perfiles ni inventa datos de acceso.

1. Completa las variables públicas existentes en `.env.local`, habilita Authentication con **Anonymous** y **Email/Password**, y configura Firestore en el proyecto elegido. Storage permanece pendiente y no se inicializa en esta versión.
2. Configura las credenciales del Admin SDK **solo en el servidor**: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`; alternativamente, utiliza `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un archivo privado fuera del repositorio y define el proyecto. El nombre del bucket se conserva en `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, pero no se inicializa ni utiliza para subidas. Nunca añadas el prefijo `NEXT_PUBLIC_` a claves privadas ni las publiques en Git. El archivo de ejemplo contiene únicamente nombres vacíos.
3. Crea el primer usuario administrador desde Firebase Authentication y, desde la consola o un backend de confianza, crea `users/{UID}` con `{ role: "admin", displayName: "Administración", email: "correo-real", disabled: false }`. No existe registro público ni opción para otorgarse un rol desde el navegador.
4. Revisa `firestore.rules` y valida permisos antes de publicarlas. `storage.rules` queda preparada para el futuro y solo se prueba en emuladores; no es necesario activar Blaze ni desplegar Storage en esta etapa.
5. Reinicia o vuelve a compilar Next.js. Inicia sesión con el administrador real en `/maestro/login` y crea las cuentas desde `/admin`. Los endpoints verifican el token y el rol en el servidor antes de usar el Admin SDK.

Las cuentas creadas por el panel real usan el UID de Authentication como identificador tanto de `masters/{UID}` como de `users/{UID}`; el documento privado contiene `role: "maestro"`, `masterId: UID`, correo y nombre, nunca contraseñas. La edición y eliminación administrativa asumen esa correspondencia. Los perfiles antiguos con otra estructura necesitan una migración de confianza antes de gestionarse desde este panel.

La sesión de personal usa una app Firebase separada de la sesión anónima del visitante. Los maestros consultan `chats` con `where("masterId", "==", masterId)` y las reglas validan la asignación. El directorio administrativo se pagina de 50 en 50 y el catálogo escucha los perfiles activos sin un límite fijo de 20 o 100.

Los 20 ejemplos locales no se importan automáticamente como cuentas reales. Mientras el directorio remoto nunca se haya inicializado, el catálogo puede mostrarlos como demostración. La primera creación real marca `publicConfig/catalog.hasMasters`; después, ocultar todos los perfiles deja el catálogo vacío y no resucita ejemplos. Los perfiles creados en producción empiezan con cero reseñas. El administrador puede marcar explícitamente perfiles de prueba para permitir su eliminación si no tienen chats.

## Comprobaciones

`npm run build`, `npm run lint` y `npm test` verifican compilación, estilo y escenarios de permisos, aislamiento y persistencia. `npm run test:rules` comprueba las reglas contra emuladores locales de Firestore y Storage (Java 21+ en PATH). Las pruebas con dobles del SDK y los emuladores no sustituyen una prueba con credenciales reales. Las fotos locales admiten hasta 2 MB, sujetas al espacio disponible del navegador. La guía de publicación y medición está en [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md).

Los perfiles reales aceptan avatares por URL HTTPS. La carga local de fotos solo está disponible en la demostración sin Firebase; no se envían archivos a Storage.
