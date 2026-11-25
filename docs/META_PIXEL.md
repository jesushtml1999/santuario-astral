# Píxel de Meta

## Origen configurado

- Nombre: **Santuario Astral - Web**.
- ID público confirmado en Meta: **4271079873190775**.
- Portfolio: Rifas Ganadoras (el mismo que contiene la página Santuario Astral).
- Variable `NEXT_PUBLIC_META_PIXEL_ID` guardada en `.env.local` y en Vercel **Production**. Preview queda sin este ID para no mezclar visitas de pruebas con producción.
- Configuración realizada el 25 de noviembre de 2026. La integración es del píxel del navegador; no requiere activar la API de conversiones del portfolio.
- [Administrador de eventos de este origen](https://eventsmanager.facebook.com/events_manager2/list/dataset/4271079873190775/overview?business_id=1228506707022859).

## Configuración

1. En el portfolio de Santuario Astral de Meta Business Suite, abre **Configuración → Orígenes de datos → Conjuntos de datos y píxeles**. Selecciona el origen de datos web de Santuario Astral y confirma su ID en **Administrador de eventos → Configuración**. No uses el ID de la página de Facebook, la cuenta publicitaria ni el conjunto de datos de Manychat/WhatsApp.
2. Copia únicamente el ID numérico en `.env.local`:

   ```dotenv
   NEXT_PUBLIC_META_PIXEL_ID=ID_NUMERICO_DEL_PIXEL
   ```

   Es un identificador público, no una contraseña. No se necesita un token de acceso ni una clave de la API de conversiones. Dejarlo vacío o con un formato inválido desactiva el SDK y los eventos.
3. En **Vercel → santuario-astral → Settings → Environment Variables**, añade el mismo nombre y valor para **Production**. Preview es opcional: si lo habilitas, tus visitas a despliegues de prueba también llegarán a ese píxel. Para separar las pruebas utiliza otro píxel en Preview/Development.
4. Reinicia `npm run dev` después de editar `.env.local`. En Vercel vuelve a desplegar: Next.js incorpora las variables `NEXT_PUBLIC_*` durante el build. Cambiar la variable sin desplegar no modifica una web ya publicada.

Los ejemplos `.env.example` y `.env.local.example` incluyen esta variable. `.env.local` sigue excluido de Git. El ID solo se lee desde el entorno; no hay un valor de producción en el código fuente.

## Carga y navegación

`src/app/layout.tsx` incluye una única instancia de `MetaPixel` dentro de Suspense. El componente prepara primero la cola oficial `fbq` e inicializa el ID, y después carga `https://connect.facebook.net/en_US/fbevents.js` mediante `next/script` con `afterInteractive`. No añade un PageView paralelo con una imagen `noscript`.

`fbq.disablePushState = true` desactiva los PageView automáticos del historial del SDK: el efecto de `usePathname`/`useSearchParams` controla los cambios de ruta y consulta. La deduplicación evita repetir eventos al ejecutar de nuevo efectos de React, al cargar el SDK o al recibir nuevos snapshots de Firestore. Volver realmente a una página sí cuenta como otra visita. Los enlaces de ancla no añaden PageView.

No hay eventos del embudo en `/admin`, `/maestro/login` ni `/maestro/panel`. Abrir un chat como maestro tampoco dispara `Contact` ni `FirstMessageSent` de cliente. El SDK ausente, los bloqueadores y el almacenamiento local denegado no bloquean consultas ni mensajes. Una cola limitada evita acumular eventos indefinidamente si el SDK no llega a cargar.

## Eventos

| Acción confirmada | Evento | Frecuencia |
| --- | --- | --- |
| Carga o navegación en páginas del cliente | `PageView` | Una vez por visita/ruta y query |
| Perfil de maestro cargado | `ViewContent` | Una vez por perfil y visita |
| Clic que revela una carta nueva | `ViewContent`, `content_category: daily_card` | Una vez en esa visita; restaurar la carta guardada no dispara otro revelado |
| Formulario inicial guardado y sala creada/actualizada | `Lead` y `StartConsultation` personalizado | Una vez por solicitud de consulta; no por abrir el modal ni por fallos |
| Sala autorizada abierta como cliente | `Contact` | Una vez por sala y visita; no ante errores de autorización |
| Primer mensaje adicional del cliente enviado correctamente | `FirstMessageSent` personalizado | Una vez por sala en este navegador; excluye el mensaje inicial del modal |

`Lead`, `Contact` y `StartConsultation` representan fases distintas; no sumes sus recuentos como si fueran personas diferentes. Se conservan los eventos personalizados anteriores para no romper informes existentes. `eventID` identifica cada envío y los reintentos del formulario conservan el mismo identificador de solicitud.

Los parámetros manuales no contienen nombre del visitante, WhatsApp, correo, fecha/signo, pregunta, contenido de mensajes ni archivos. La carta se mide como una interacción genérica sin transmitir la carta elegida. No se habilitan coincidencias avanzadas ni captura automática de formularios. Los perfiles/entornos de demostración se identifican con `demo_mode` cuando aplica; no los consideres conversiones comerciales reales. El SDK puede transmitir la URL y datos propios del navegador, por lo que los parámetros manuales no equivalen a anonimización del tráfico. No añadas datos personales a las URLs.

## Verificación real

1. Usa Chrome sin bloqueo de publicidad para este sitio. En **Administrador de eventos → Orígenes de datos**, selecciona el ID exacto que configuraste y abre **Probar eventos**.
2. En la sección para probar eventos del navegador, abre `https://santuario-astral.vercel.app/`. Confirma un `PageView`. La pestaña de pruebas puede requerir mantener la sesión de Meta abierta.
3. Navega al catálogo y a un perfil: comprueba un `PageView` por navegación y un `ViewContent` de perfil. El corazón de favoritos y las actualizaciones de disponibilidad no deben sumar visitas.
4. Si hoy no has revelado la carta, revélala: comprueba `ViewContent` con categoría `daily_card`. Una recarga conserva la carta y no debe registrar otro revelado. Para probar de cero puedes usar otro perfil de navegador.
5. Inicia una consulta de prueba con datos no sensibles: solo después de guardarla deben llegar `Lead` y `StartConsultation`; al autorizar la sala, `Contact`. Un mensaje posterior exitoso añade `FirstMessageSent`; los siguientes no lo repiten. Identifica esa consulta como prueba y no la cuentes como cliente real.
6. Alternativamente utiliza la extensión oficial **Meta Pixel Helper**, publicada por Meta en Chrome Web Store. Debe mostrar un solo píxel con el ID correcto, PageView y los eventos correspondientes. Esta implementación no instala extensiones automáticamente.
7. Si no ves eventos: verifica el ID, la variable de **Production**, la fecha del último build, el bloqueo de scripts y los diagnósticos del origen de datos en Meta. Los resúmenes agregados pueden actualizarse después de Probar eventos. Un build correcto o una petición de red no demuestran por sí solos la recepción en Events Manager.

Referencias oficiales: [Meta Pixel: eventos](https://developers.facebook.com/documentation/meta-pixel/implementation/conversion-tracking), [plantilla oficial de Meta y control de eventos del historial](https://github.com/meta/GoogleTagManager-WebTemplate-For-FacebookPixel), [Next.js Script](https://nextjs.org/docs/app/api-reference/components/script).
