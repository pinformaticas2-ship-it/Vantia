# Editor de documentos (ONLYOFFICE Docs)

Permite abrir y editar Word, Excel y PowerPoint de clientes y expedientes desde
el navegador, con coedición. En la pestaña de documentos aparece el botón del
lápiz («Editar en el navegador») cuando el backend tiene configurado el
servidor.

- Backend: `backend/src/controllers/onlyofficeController.ts`
- Frontend: `frontend/src/components/OnlyOfficeEditor.tsx`
- Licencia: ONLYOFFICE Docs Community (AGPL v3, gratis). Admite unas 20
  conexiones de edición simultáneas. Se usa sin modificar, así que no obliga a
  publicar el código del ERP.

## Cómo funciona

1. El frontend pide `GET /api/files/:clientId/:fileId/onlyoffice`. El backend
   devuelve la configuración del editor firmada con JWT.
2. El Document Server descarga el archivo desde `/api/files/dl/:token`.
3. Al pulsar **Guardar**, o unos 10 segundos después de que todos cierren el
   editor, el Document Server llama a
   `POST /api/files/onlyoffice/callback/:clientId/:fileId`. El backend descarga
   la versión nueva y sobrescribe el adjunto en disco y en Drive o Dropbox, si
   aplica.

Los formatos `docx`, `xlsx`, `pptx`, `odt`, `ods` y `odp` se pueden editar.
Los antiguos (`doc`, `xls`, `ppt` y `rtf`) y `csv` se abren solo para consulta.

## Producción (gratis con Oracle Cloud Free Tier)

1. Crea una instancia **Ampere A1 (ARM)** en Oracle Cloud con 2–4 OCPU,
   8–24 GB de RAM y Ubuntu 22.04. Entra en el nivel *Always Free*.
2. En la *Security List* de la VCN abre los puertos **80 y 443**. Haz lo mismo
   en el cortafuegos de la máquina:
   ```bash
   sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
3. Crea un registro DNS **A**, por ejemplo `docs.tudominio.com`, que apunte a
   la IP pública.
4. Instala Docker y levanta el servidor:
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone <este repo> && cd lextech-erp/onlyoffice   # o copia solo esta carpeta
   cp .env.example .env && nano .env                     # DOMINIO y JWT_SECRET
   sudo docker compose up -d
   ```
   Caddy obtiene el certificado HTTPS solo. El primer arranque de ONLYOFFICE
   tarda 1–2 minutos. Para comprobarlo, `https://docs.tudominio.com/healthcheck`
   tiene que responder `true`.
5. En el backend (Railway o Render) añade estas variables y redespliega:
   ```
   ONLYOFFICE_URL=https://docs.tudominio.com
   ONLYOFFICE_JWT_SECRET=<el mismo JWT_SECRET>
   ```
   `PUBLIC_BACKEND_URL` tiene que ser la URL pública del backend: el Document
   Server la usa para descargar los archivos y avisar al guardar.

## Desarrollo local

```bash
docker compose up -d onlyoffice      # desde lextech-erp/, en http://localhost:8080
```

Variables del backend en local:

```
ONLYOFFICE_URL=http://localhost:8080
ONLYOFFICE_JWT_SECRET=cambia-este-secreto-en-local
ONLYOFFICE_BACKEND_URL=http://host.docker.internal:<PORT del backend>
```

## Problemas habituales

- **«La descarga ha fallado»**: el Document Server no llega al backend. Revisa
  `PUBLIC_BACKEND_URL` o `ONLYOFFICE_BACKEND_URL`.
- **«El token de seguridad del documento no tiene el formato correcto»**: el
  `JWT_SECRET` del servidor y `ONLYOFFICE_JWT_SECRET` del backend no coinciden.
- **El editor no carga (contenido mixto)**: `ONLYOFFICE_URL` tiene que ser
  `https://` si el ERP se sirve por HTTPS.
- Para ver los logs: `docker compose logs -f onlyoffice`.
