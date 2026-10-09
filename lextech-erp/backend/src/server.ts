import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import entityRoutes from './routes/entities';
import ocrRoutes from './routes/ocr';
import activityRoutes from './routes/activity';
import vantiaRoutes from './routes/vantia';
import filesRoutes from './routes/files';
import tasksRoutes from './routes/tasks';
import expedientesRoutes from './routes/expedientes';
import agendaRoutes from './routes/agenda';
import agendaBookingRoutes from './routes/agendaBooking';
import chatRoutes           from './routes/chat';
import emailRoutes          from './routes/email';
import emailEngineWebhookRoute from './routes/emailEngineWebhook';
import sharedTemplatesRoutes from './routes/sharedTemplates';
import firmaImagenesRoutes, { servirFirmaImagen } from './routes/firmaImagenes';
import whatsappRoutes       from './routes/whatsapp';
import documentImportRoutes from './routes/documentImport';
import documentalRoutes     from './routes/documental';
import clientInviteRoutes   from './routes/clientInvite';
import facturacionRoutes    from './routes/facturacion';
import quipuRoutes          from './routes/quipu';
import quickLinksRoutes     from './routes/quickLinks';
import directorioRoutes     from './routes/directorio';
import organizacionRoutes   from './routes/organizacion';
import preferencesRoutes    from './routes/preferences';
import pushRoutes           from './routes/push';
import soporteRoutes        from './routes/soporte';
import plaudRoutes          from './routes/plaud';
import vistasRoutes         from './routes/vistas';
import { syncAllQuipuUsers } from './controllers/quipuController';
import { syncAllOrganizacionesDriveChanges } from './utils/googleDriveSync';
import { clerkMiddleware } from '@clerk/express';
import { resolveOrg } from './middleware/resolveOrg';
import { runMigrations } from './config/migrations';
import { startLocalFilesWatcher } from './watchers/localFilesWatcher';
import { startPlazoPushScheduler } from './services/plazoPushScheduler';
import { startSoporteRetencionScheduler } from './services/soporteRetencion';
import { startVistasScheduler } from './services/vistasAutomation';
import { startImapAutoSync } from './services/imapAutoSync';
import { startVistasIdle } from './services/vistasIdle';
import { heartbeatEnd } from './utils/heartbeat';
import { migrateLocalFoldersStructure } from './controllers/filesController';
import { logServerStart } from './controllers/activityController';
import pool from './config/database';
import { SHOULD_START_LOCAL_WATCHER, UPLOADS_ROOT } from './config/paths';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// CORS_ALLOWED_ORIGINS: lista de orígenes exactos separados por coma.
//   Si está vacío → permite TODOS (modo permisivo, útil en desarrollo).
// CORS_ALLOWED_PATTERNS: patrones sufijo separados por coma (p.ej. ".vercel.app").
//   Por defecto incluye ".vercel.app" y "localhost" para cubrir cualquier
//   preview/deployment de Vercel sin tener que actualizar la variable cada vez.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Patrones siempre activos (independiente de env vars). Antes era ".vercel.app"
// a secas, que cualquiera puede conseguir creando su propio proyecto de
// Vercel (name-lo-que-sea.vercel.app) -- con eso, un sitio ajeno podría hacer
// peticiones autenticadas (credentials incluidas) contra esta API desde el
// navegador de un usuario logueado. Restringido al propio team/slug de
// Vercel del despacho, que nadie más puede registrar.
const HARDCODED_PATTERNS = ['-pinformaticas2-ship-its-projects.vercel.app', 'localhost', '127.0.0.1'];
const allowedPatterns = [
  ...HARDCODED_PATTERNS,
  ...(process.env.CORS_ALLOWED_PATTERNS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
];

function isCorsAllowed(origin: string | undefined): boolean {
  if (!origin) return true;                          // mismo origen / curl
  if (allowedOrigins.includes(origin)) return true;  // coincidencia exacta
  // Si CORS_ALLOWED_ORIGINS no está configurada, antes esto abría el CORS a
  // CUALQUIER origen (con credenciales incluidas) -- ahora, esté configurada
  // o no, solo se admiten los patrones conocidos de abajo.
  return allowedPatterns.some((pattern) => origin.includes(pattern));
}

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

// --- MIDDLEWARES GLOBALES ---
// CORS debe ir PRIMERO — antes de Clerk y cualquier auth.
// Los preflight OPTIONS no llevan token y Clerk los bloquearía si va antes.
app.use(cors({
  origin: (origin, callback) => {
    if (isCorsAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS bloqueado para origen: ${origin}`);
      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(helmet({
  crossOriginResourcePolicy: false,
  frameguard: false,
  contentSecurityPolicy: false,
}));

// EmailEngine webhooks sin auth — registrar antes de Clerk
app.use('/api/email/webhook/engine', emailEngineWebhookRoute);

app.use(clerkMiddleware());
app.use(resolveOrg);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Cache control: evitar datos stale en el navegador ────────
app.use('/api', (_req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  next();
});

// ── Compresión gzip de respuestas para velocidad ─────────────
// El endpoint de streaming de Vantia (SSE) queda FUERA por completo del
// middleware, no solo desactivado vía `filter`: compression() sobreescribe
// res.write/res.end/res._implicitHeader nada más entrar (para poder decidir
// si comprime al ver el primer chunk), y esa envoltura se queda puesta pase
// lo que pase con el filtro. Con una respuesta larga y en trozos como esta
// (muchos res.write() a lo largo de varios segundos) esa envoltura extra es
// justo el tipo de cosa que puede desordenar el framing HTTP y provocar
// cortes de conexión con el navegador. Saltarse compression() del todo para
// esta ruta, en vez de solo decirle "no comprimas", es la manera segura.
// Lo mismo para /api/email/events (avisos de correo y chat en tiempo real):
// con gzip los avisos se quedaban en el búfer del compresor y el navegador
// no recibía nada (09/10/2026).
const compressionMw = compression();
app.use((req, res, next) => {
  if (req.path === '/api/vantia/chat/stream' || req.path === '/api/email/events') return next();
  return compressionMw(req, res, next);
});

// Servir archivos estáticos (fotos DNI subidas, etc.)
// El frontend y el backend viven en dominios distintos (Vercel/Railway), asi que
// el atributo HTML "download" de un <a> no funciona (el navegador lo ignora en
// enlaces cross-origin y solo abre/previsualiza el archivo). Con ?download=1
// forzamos Content-Disposition: attachment, que si se respeta cross-origin.
app.use('/uploads', (req, res, next) => {
  if (req.query.download) {
    const name = typeof req.query.name === 'string' && req.query.name.trim()
      ? req.query.name.trim()
      : path.basename(req.path);
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
  }
  next();
});
// Imágenes y archivos del chat: se guardan en la BD (chat_uploads), no en
// disco -- ver server.ts import de pool y chatController.ts. Si no se
// encuentra en la BD, cae al static de abajo (por si el archivo aún vive en
// disco de antes de este cambio).
app.get('/uploads/chat/files/:filename', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT mimetype, original_name, data FROM chat_uploads WHERE filename = $1 AND kind = 'file'`,
      [req.params.filename],
    );
    if (!rows.length) return next();
    const row = rows[0];
    res.setHeader('Content-Type', row.mimetype || 'application/octet-stream');
    if (!res.getHeader('Content-Disposition')) {
      const name = typeof req.query.name === 'string' && req.query.name.trim()
        ? req.query.name.trim()
        : (row.original_name || req.params.filename);
      res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${String(name).replace(/"/g, '')}"`);
    }
    res.send(row.data);
  } catch (_e) {
    next();
  }
});
app.get('/uploads/chat/:filename', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT mimetype, data FROM chat_uploads WHERE filename = $1 AND kind = 'image'`,
      [req.params.filename],
    );
    if (!rows.length) return next();
    res.setHeader('Content-Type', rows[0].mimetype || 'image/png');
    res.send(rows[0].data);
  } catch (_e) {
    next();
  }
});
// Fotos de DNI y logos de organización: mismo patrón que el chat -- se
// guardan en la BD (tabla misc_uploads), con el disco como fallback para lo
// que aún viviera ahí de antes de este cambio.
app.get('/uploads/dnis/:filename', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT mimetype, data FROM misc_uploads WHERE filename = $1 AND kind = 'dni'`,
      [req.params.filename],
    );
    if (!rows.length) return next();
    res.setHeader('Content-Type', rows[0].mimetype || 'image/jpeg');
    res.send(rows[0].data);
  } catch (_e) {
    next();
  }
});
app.get('/uploads/org-logos/:filename', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT mimetype, data FROM misc_uploads WHERE filename = $1 AND kind = 'org_logo'`,
      [req.params.filename],
    );
    if (!rows.length) return next();
    res.setHeader('Content-Type', rows[0].mimetype || 'image/png');
    res.send(rows[0].data);
  } catch (_e) {
    next();
  }
});
app.use('/uploads', express.static(UPLOADS_ROOT));

// --- RUTAS ---
app.use('/api/entities', entityRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/vantia', vantiaRoutes);
app.use('/api/files',  filesRoutes);
app.use('/api/tasks',       tasksRoutes);
app.use('/api/expedientes/documents', documentImportRoutes);
app.use('/api/expedientes', expedientesRoutes);
app.use('/api/agenda',      agendaRoutes);
app.use('/api/agenda/booking', agendaBookingRoutes);
app.use('/api/chat',              chatRoutes);
app.use('/api/email',             emailRoutes);
app.use('/api/shared-templates',  sharedTemplatesRoutes);
// Imágenes de las firmas de correo: subir (con sesión) y servir (público, lo pide el destinatario).
app.use('/api/firma-imagenes',    firmaImagenesRoutes);
app.get('/api/public/firma-imagen/:file', servirFirmaImagen);
app.use('/api/whatsapp',          whatsappRoutes);
app.use('/api/documental',        documentalRoutes);
app.use('/api/clientes/invites',  clientInviteRoutes);
app.use('/api/facturacion',       facturacionRoutes);
app.use('/api/quipu',             quipuRoutes);
app.use('/api/quick-links',       quickLinksRoutes);
app.use('/api/directorio',        directorioRoutes);
app.use('/api/organizacion',      organizacionRoutes);
app.use('/api/preferences',       preferencesRoutes);
app.use('/api/push',              pushRoutes);
app.use('/api/soporte',           soporteRoutes);
app.use('/api/plaud',             plaudRoutes);
app.use('/api/vistas',            vistasRoutes);

// Health check básico
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), build: 'b63960c' });
});

// Diagnóstico de rutas de almacenamiento
app.get('/api/health/storage', (_req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { UPLOADS_ROOT, CLIENT_FILES_ROOT, DATA_ROOT } = require('./config/paths');
  const check = (p: string) => ({ path: p, exists: fs.existsSync(p) });
  const docplantCwd  = path.join(process.cwd(), 'DocPlant');
  const docplantDir  = path.resolve(__dirname, '../../DocPlant');
  res.json({
    cwd: process.cwd(),
    __dirname,
    DATA_ROOT_env: process.env.DATA_ROOT || '(no configurado)',
    paths: {
      DATA_ROOT: check(DATA_ROOT),
      UPLOADS_ROOT: check(UPLOADS_ROOT),
      CLIENT_FILES_ROOT: check(CLIENT_FILES_ROOT),
      DocPlant_via_cwd: check(docplantCwd),
      DocPlant_via_dirname: check(docplantDir),
    }
  });
});

app.get('/api/health/version', (_req, res) => {
  res.json({
    status: 'ok',
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.SOURCE_VERSION ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      'unknown',
    branch:
      process.env.RAILWAY_GIT_BRANCH ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      'unknown',
    deployedAt: new Date().toISOString(),
  });
});

// Health check de base de datos — visita http://localhost:4000/api/health/db para diagnosticar
app.get('/api/files/setup/vantia-protocol.ps1', (_req, res) => {
  const fs = require('fs');
  const path = require('path');
  const scriptPath = path.resolve(__dirname, '../resources/vantia-setup.ps1');
  if (!fs.existsSync(scriptPath)) return res.status(404).send('Script no encontrado.');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="vantia-setup.ps1"');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(scriptPath);
});

app.get('/api/health/db', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS db,
        current_user       AS user,
        NOW()              AS server_time,
        (SELECT COUNT(*) FROM entities) AS entity_count
    `);
    res.json({ status: 'ok', ...result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err?.message || String(err) });
  }
});

// --- MANEJADOR DE ERRORES GLOBAL ---
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isAuthError =
    err.status === 401 ||
    err.statusCode === 401 ||
    err.message === 'Unauthenticated' ||
    err.clerkError === true ||
    /unauthenticated|unauthorized|invalid.*token|token.*invalid|jwt|clerk/i.test(err.message || '');

  if (isAuthError) {
    console.warn('⚠️ Auth error (→401):', err.message);
    return res.status(401).json({ success: false, error: 'Sesión no válida o expirada' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
  }
  console.error('❌ Error [status=%s code=%s]:', err.status ?? err.statusCode ?? '?', err.code ?? '?', err.stack || err.message);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// Arrancar servidor después de ejecutar migraciones
runMigrations().then(() => {
  app.listen(PORT, async () => {
    console.log(`🛡️  VANTIA Backend corriendo en http://localhost:${PORT}`);

    // Validar formato de GEMINI_API_KEY en arranque
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (!geminiKey) {
      console.warn('⚠️  GEMINI_API_KEY no configurada — importación de documentos y Vantia desactivados.');
    } else if (!geminiKey.startsWith('AIzaSy') && !geminiKey.startsWith('AQ.')) {
      // Google AI Studio da claves "AIzaSy…" (formato antiguo) o "AQ.…" (nuevo).
      console.warn('⚠️  GEMINI_API_KEY con un formato no habitual (ni AIzaSy… ni AQ.…). Si Vantia falla, genera una en https://aistudio.google.com/apikey');
    } else {
      console.log('✅ GEMINI_API_KEY configurada correctamente.');
    }

    if (SHOULD_START_LOCAL_WATCHER) {
      startLocalFilesWatcher();
      migrateLocalFoldersStructure();
    }
    // Qué integraciones ve este proceso (solo sí/no, nunca valores) -- para
    // poder diagnosticar desde la BD por qué un proceso de fondo no corre.
    void heartbeatEnd('server', {
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
      emailEngine: Boolean(process.env.EMAIL_ENGINE_URL),
      gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      push: Boolean(process.env.VAPID_PUBLIC_KEY),
      resend: Boolean(process.env.RESEND_API_KEY),
      brevo: Boolean(process.env.BREVO_API_KEY),
      smtpRelay: Boolean(process.env.SMTP_RELAY_HOST),
    });

    // Registrar arranque en trazabilidad
    try { await logServerStart(); } catch { /**/ }

    // Notificaciones push: aviso de plazos próximos a vencer
    startPlazoPushScheduler();

    // Centro de soporte: aviso (con CSV) y borrado de tickets cerrados hace 15 días
    startSoporteRetencionScheduler();

    // Automatización de vistas por correo (solo actúa en las organizaciones
    // que la tengan activada en Configuración → Automatizaciones)
    startVistasScheduler();
    // ...y aviso inmediato (IMAP IDLE) en cuanto entra un correo al buzón vigilado.
    startVistasIdle();

    // Correo IMAP: todas las carpetas de todas las cuentas se actualizan solas
    // cada 5 min (como Thunderbird), aunque nadie tenga abierta la página de Correo.
    startImapAutoSync();

    // Quipu auto-sync: run once after 30s (let DB settle), then every 30 min
    setTimeout(() => {
      syncAllQuipuUsers().catch(() => {});
      setInterval(() => syncAllQuipuUsers().catch(() => {}), 30 * 60 * 1000);
    }, 30_000);

    // Google Drive: refleja en Vantia los cambios hechos directamente en
    // Drive (renombrar, borrar/mover a papelera) -- sondeo cada 5s para que
    // se note casi al instante (la Changes API es barata, no hay límite de
    // cuota real con este volumen de organizaciones).
    setTimeout(() => {
      syncAllOrganizacionesDriveChanges().catch(() => {});
      setInterval(() => syncAllOrganizacionesDriveChanges().catch(() => {}), 5_000);
    }, 5_000);

    // EmailEngine startup: configure webhook and register existing IMAP accounts
    const emailEngineUrl = process.env.EMAIL_ENGINE_URL;
    if (emailEngineUrl) {
      const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
      setTimeout(async () => {
        try {
          const { eeHealthCheck, eeConfigureWebhook, eeRegisterAccount } = await import('./utils/emailEngineClient');
          const { decryptPassword } = await import('./utils/emailCrypto');

          const healthy = await eeHealthCheck();
          if (!healthy) { console.warn('⚠️  EmailEngine no responde en', emailEngineUrl); return; }

          await eeConfigureWebhook(`${publicUrl}/api/email/webhook/engine`);
          console.log('✅ EmailEngine webhook configurado →', `${publicUrl}/api/email/webhook/engine`);

          const { rows: accounts } = await pool.query(
            `SELECT id, label, email, imap_host, imap_port, imap_secure,
                    smtp_host, smtp_port, smtp_secure, username, password_enc
               FROM email_accounts WHERE active=true AND COALESCE(protocol,'imap')='imap'`,
          );
          for (const acc of accounts) {
            const pass = decryptPassword(acc.password_enc);
            await eeRegisterAccount({
              account: acc.id,
              name: acc.label,
              email: acc.email,
              imap: { host: acc.imap_host, port: acc.imap_port, secure: acc.imap_secure, auth: { user: acc.username, pass } },
              smtp: { host: acc.smtp_host, port: acc.smtp_port, secure: acc.smtp_secure, auth: { user: acc.username, pass } },
            }).catch(() => {});
          }
          console.log(`✅ EmailEngine: ${accounts.length} cuenta(s) IMAP registradas`);
        } catch (e: any) {
          console.warn('⚠️  EmailEngine startup error:', e?.message || e);
        }
      }, 5_000);
    }
  });
});
