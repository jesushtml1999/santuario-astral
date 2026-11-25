# Presencia automática de maestros

- El componente global `StaffPresence` abre una conexión por pestaña cuando Auth y `users/{uid}` confirman el rol maestro.
- La API `/api/staff/presence` verifica el ID token, su revocación, el rol y la identidad del perfil. Admins y clientes no pueden publicar presencia.
- Se envía un latido cada 25 segundos. Cada conexión tiene una vigencia de 90 segundos, calculada por el servidor.
- Al cerrar sesión se espera la desconexión antes de borrar Auth. `pagehide` usa `fetch` con `keepalive`; `pageshow`/online restauran la conexión.
- Los identificadores de conexión quedan privados en `staffPresence/{uid}` (denegados en reglas). El catálogo solo recibe `isOnline` y `presenceExpiresAt` en el perfil público.
- Las transacciones conservan otras conexiones y guardan una marca de cierre temporal para impedir que una petición tardía reactive una pestaña cerrada.
- Catálogo, perfil, panel y chat comprueban la caducidad con un temporizador local: si hay cierre brusco o pérdida de red, aparece Ocupado en un máximo aproximado de 90 segundos, incluso sin otra escritura.
- El interruptor manual permite ponerse Ocupado mientras se mantiene la sesión. Los latidos no anulan esa decisión; una conexión nueva vuelve a activar la disponibilidad.
- Los perfiles sin una conexión confirmada o con datos de respaldo no aparecen conectados en producción.

No requiere otro servicio de Firebase, variables adicionales, cron ni migración de usuarios. La API utiliza las credenciales Admin ya configuradas en Vercel.
