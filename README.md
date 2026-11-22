# Santuario Astral

Next.js App Router, TypeScript estricto, Tailwind y Firebase Auth + Firestore. Preparado para Vercel con Node.js 24. El inicio conserva el catálogo y comprueba Firestore mediante una consulta pública de solo lectura. Un catálogo vacío es un estado válido; los ejemplos se identifican como demostración.

## Desarrollo

En PowerShell, dentro del proyecto:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm ci
npm run dev
```

Completa las seis variables de `.env.example` en `.env.local`. En este equipo ya están configuradas para el proyecto vinculado. No reemplaces ese archivo con el ejemplo vacío. `.env.local` está excluido de Git; los ejemplos se pueden versionar. El nombre del bucket se conserva como configuración, pero no inicializa Storage.

## Estructura

```text
src/app/                         Rutas App Router y layout
  page.tsx                      Inicio y catálogo con estado de conexión
  maestro/login/                Acceso del personal
  maestro/panel/                Bandeja y edición de perfil
  admin/                        Gestión de maestros
  api/admin/masters/            API protegida del administrador
src/components/                 Interfaz y comprobación de conexión
src/lib/firebase.ts             Firebase Auth y Firestore del visitante
src/lib/staffFirebase.ts         Sesión de personal separada
src/lib/firestoreConnection.ts   Comprobación pública sin escrituras
src/lib/mediaUploads.ts         Interfaz pendiente para cargas futuras
src/types/                      Modelos TypeScript
tests/                          Pruebas de sesión, chat, Pixel y reglas
.env.example                    Seis variables públicas vacías
vercel.json                     Preset Next.js, lint y build
```

## Storage pendiente

La aplicación no importa ni inicializa Firebase Storage ni sube archivos, fotos o audios a la nube. Los chats de Firestore admiten texto; sus botones de archivos y micrófono quedan deshabilitados con una explicación. Los avatares reales aceptan URL HTTPS. La demostración local conserva sus adjuntos en el navegador y no los envía a Firebase.

`PendingCloudMediaAdapter` define el contrato para una implementación futura. Activar Blaze no habilita subidas automáticamente: habrá que implementar y revisar el adaptador. `storage.rules` y sus pruebas locales se conservan como preparación, sin publicarlas ni activar facturación.

## Comprobación

```powershell
npm run lint
npm test
npm run build
```

Opcionalmente, con Java 21+ en PATH: `npm run test:rules`. Utiliza solo emuladores y el proyecto desechable `demo-santuario-astral`.

## GitHub

Crea un repositorio vacío en GitHub, sin README, licencia ni `.gitignore` iniciales. Ejecuta desde `santuario-astral`; no se ha inicializado ni publicado Git automáticamente:

```powershell
git init -b main
git add .
git status --short
git commit -m "Preparar Santuario Astral para Vercel"
$repoUrl = Read-Host "Pega la URL HTTPS de tu repositorio vacío de GitHub"
git remote add origin $repoUrl
git push -u origin main
```

`git status --short` no debe mostrar `.env.local`; sí debe mostrar `.env.example`. Si Git solicita identidad, configura tu nombre y correo con `git config user.name` y `git config user.email` para este repositorio. GitHub utiliza su gestor de credenciales.

## Vercel

Importa el repositorio. Usa su raíz si inicializas Git dentro de `santuario-astral`; si subes la carpeta superior, selecciona `santuario-astral` como Root Directory. El preset es Next.js y Node está fijado a 24.x. `vercel.json` ejecuta lint antes del build. No uses exportación estática: el panel Admin necesita Route Handlers de Node.

Añade las mismas seis variables públicas en Vercel antes de desplegar. Cambiarlas requiere un nuevo despliegue. Para chats y acceso real activa Auth anónimo y Email/Password y autoriza el dominio HTTPS. Para administración real configura también las credenciales privadas de servidor según [STAFF_SETUP.md](STAFF_SETUP.md); nunca las publiques ni uses prefijo `NEXT_PUBLIC_`. Meta Pixel es opcional y permanece desactivado si `NEXT_PUBLIC_META_PIXEL_ID` está vacío.

Consulta [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md) para el flujo completo. Esta preparación no crea cuentas, no siembra perfiles reales, no activa Blaze y no despliega la web. Revisa los avisos heredados de dependencias con `npm audit --omit=dev` antes de producción.
