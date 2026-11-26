# Avisos de chat mientras la web está abierta

Antes existían contadores de no leídos, lectura automática en la sala visible y
una bandeja en tiempo real del maestro. No había sonido, avisos globales ni título
de pestaña. «Mis Chats» consultaba datos al entrar o recuperar el foco.

Ahora `ChatNotifications`, montado una vez en el layout, escucha la bandeja del
participante en todas las rutas. `Mis Chats` y su badge usan esos mismos datos.
El maestro conserva los contadores de su panel y tiene además el control global.

- Firestore: consulta por `masterId == uid` para el maestro y por
  `clientAuthUid == uid` para el cliente. También se valida el propietario antes
  de exponer datos. Cambiar sesión cancela las escuchas y vacía los avisos.
- Demo: escucha cambios locales de las salas correspondientes, sin servicios externos.
- Los snapshots de caché o pendientes no disparan alertas. El primer snapshot
  confirmado establece una base silenciosa; los no leídos históricos sí se ven.
- Al cambiar `lastMessageId`, se verifica el mensaje y su remitente antes de avisar.
  Esto añade una lectura puntual por mensaje nuevo de una sala, y permite avisar
  aunque la sala visible ya haya marcado el mensaje como leído. No hay una escucha
  adicional por sala ni se descargan todos los historiales para notificar.
- Los cambios de etiqueta, lectura, mensajes propios y snapshots repetidos no suenan.
  Varias llegadas rápidas producen un sonido breve, sin una sucesión molesta de tonos.
- El sonido se genera localmente con Web Audio. Se habilita tras una interacción
  o con **Activar sonido**. **Sonido activado** permite silenciarlo; se recuerda esa
  preferencia. No se reproducen mensajes anteriores al activarlo. Si el navegador
  suspende el audio, hace falta otra interacción o pulsar el botón nuevamente.
- Web Locks y un registro acotado de IDs coordinan el sonido entre pestañas.
  Si el navegador bloquea también el almacenamiento, solo puede garantizarse la
  deduplicación dentro de cada pestaña. No se guardan nombres ni mensajes en ese registro.
- La campana y «Mis Chats» muestran no leídos. Un aviso de diez segundos permite
  abrir la conversación. Cerrarlo no marca mensajes como leídos.
- En una pestaña oculta se muestra `(N) Mensajes sin leer · …`; al volver se restaura
  el título. No se incluyen preguntas, nombres ni contenido privado en el título.

## Verificación manual en dos navegadores/dispositivos

1. Iniciar sesión como maestro y pulsar **Activar sonido**. Cargar conversaciones
   antiguas: ver contadores, sin oír un aviso por cada mensaje histórico.
2. Desde otro navegador, iniciar una consulta de prueba claramente identificada:
   comprobar el aviso, contador y sonido del maestro. Enviar texto, foto y audio.
3. Responder como maestro y comprobar el aviso del cliente tanto en la sala como
   en `/catalogo`. Abrir «Mis Chats»: debe actualizarse sin recargar.
4. Dejar la pestaña del cliente oculta, responder y comprobar el título. Volver:
   se restaura; abrir la sala visible limpia los contadores mediante la lectura existente.
5. Abrir dos pestañas del mismo actor: llega un solo sonido por evento si el navegador
   permite Web Locks y almacenamiento. Cambiar de ruta, etiquetar o marcar leído no suena.
6. Silenciar, enviar otro mensaje y verificar que el aviso visual sigue funcionando.
   Cerrar sesión y comprobar que no siguen llegando avisos del maestro anterior.

No se usa la API de notificaciones del sistema, no se piden permisos de escritorio
y no se añadieron Web Push, FCM, Telegram ni otras integraciones. Estos avisos
requieren que la web siga abierta y ejecutándose; una pestaña congelada por el
sistema operativo puede demorarlos. Con la web cerrada haría falta una integración
adicional, previa autorización del usuario.

Referencias: [snapshots de Firestore](https://firebase.google.com/docs/firestore/query-data/listen),
[restricciones de audio del navegador](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
