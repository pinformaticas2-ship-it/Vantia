# EmailEngine — Servicio Railway

## Cómo añadirlo en Railway

1. En tu proyecto Railway → **New Service** → **Docker Image**
2. Imagen: `postalsys/emailengine:latest`
3. Variables de entorno del servicio EmailEngine:

```
EENGINE_REDIS=redis://default:<PASSWORD>@<REDIS_HOST>:<PORT>
EENGINE_SECRET=<clave-secreta-larga>
EENGINE_PORT=3000
```

4. Añade también un servicio **Redis** (plantilla oficial Railway).
   Copia la `REDIS_URL` que Railway te da y úsala en `EENGINE_REDIS`.

5. Variables de entorno de tu **backend** (servicio Node.js):

```
EMAIL_ENGINE_URL=http://<nombre-servicio-emailengine>.railway.internal:3000
EMAIL_ENGINE_TOKEN=<misma-clave-secreta-que-EENGINE_SECRET>
PUBLIC_URL=https://<tu-dominio-backend>.railway.app
```

## Notas importantes

- `EMAIL_ENGINE_URL` debe usar la URL interna de Railway (`.railway.internal`)
  para que backend y EmailEngine se comuniquen sin salir a internet.
- `PUBLIC_URL` es la URL pública del backend donde EmailEngine enviará webhooks.
- El token debe ser el mismo en `EENGINE_SECRET` y `EMAIL_ENGINE_TOKEN`.
- Si no configuras `EMAIL_ENGINE_URL`, el sistema funciona en modo fallback
  (sync IMAP clásico cada 8s), sin tiempo real ni descarga de adjuntos.
