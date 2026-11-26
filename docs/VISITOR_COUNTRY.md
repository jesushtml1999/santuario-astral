# Bandera del visitante en el catálogo

`/catalogo` y `/` leen `x-vercel-ip-country` con `await headers()` en
`VisitorCatalog`, un componente de servidor dentro de `Suspense`. Vercel aporta
el país ISO de dos letras según la IP de la petición. La precisión es aproximada;
una VPN o proxy puede cambiar el país detectado.

- `NI`, `CO` y `MX` muestran Nicaragua, Colombia y México, respectivamente.
- Otros códigos ISO válidos usan su SVG local de `public/flags/`.
- Sin cabecera o con un valor inválido se usa **NI (Nicaragua)**. La etiqueta
  accesible y el tooltip dicen «País de referencia», no «ubicación detectada».
- No hay permisos de ubicación, servicios externos de IP ni nuevas variables de
  entorno. No se guarda la IP, el país en Firestore ni se envía al píxel.
- El país viaja como prop del servidor al cliente, sin consulta posterior ni
  cambio de bandera al hidratar. No se cachea el país entre visitantes.
- La bandera de la tarjeta representa al visitante: su tooltip y texto alternativo
  lo indican. El `countryCode` real del maestro, su edición y las banderas del
  perfil y chat conservan su significado y comportamiento actuales.

## Prueba local

Con `npm run dev`, una petición normal a `http://localhost:3000/catalogo` usa NI.
Para simular la cabecera (solo presentación, nunca una prueba de identidad):

```powershell
curl.exe -s -H "x-vercel-ip-country: CO" http://localhost:3000/catalogo
curl.exe -s -H "x-vercel-ip-country: MX" http://localhost:3000/catalogo
curl.exe -s -H "x-vercel-ip-country: US" http://localhost:3000/catalogo
```

Las props serializadas incluyen `visitorCountry` con `countryCode` y `detected`.
En Vercel, comprobar desde las ubicaciones de prueba que cada tarjeta usa su
SVG correspondiente y conserva tamaño, filtros, favoritos y enlaces.

Referencias: [cabeceras de Vercel](https://vercel.com/docs/headers/request-headers),
[headers de Next.js](https://nextjs.org/docs/app/api-reference/functions/headers).
