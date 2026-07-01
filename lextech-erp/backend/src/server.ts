import express from 'express';
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
import chatRoutes           from './routes/chat';
import emailRoutes          from './routes/email';
import emailEngineWebhookRoute from './routes/emailEngineWebhook';
import sharedTemplatesRoutes from './routes/sharedTemplates';
import whatsappRoutes       from './routes/whatsapp';
import documentImportRoutes from './routes/documentImport';
import documentalRoutes     from './routes/documental';
import clientInviteRoutes   from './routes/clientInvite';
import facturacionRoutes    from './routes/facturacion';
import quipuRoutes          from './routes/quipu';
import { syncAllQuipuUsers } from './controllers/quipuController';
import { scheduleTaskReminderJob } from './jobs/taskReminderJob';
import { clerkMiddleware } from '@clerk/express';
import { runMigrations } from './config/migrations';
import { startLocalFilesWatcher } from './watchers/localFilesWatcher';
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

const allowedPatterns = (
  process.env.CORS_ALLOWED_PATTERNS || '.vercel.app,localhost,127.0.0.1'
)
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

function isCorsAllowed(origin: string | undefined): boolean {
  if (!origin) return true;                          // mismo origen / curl
  if (allowedOrigins.length === 0) return true;      // modo permisivo total
  if (allowedOrigins.includes(origin)) return true;  // coincidencia exacta
  // Coincidencia por sufijo: ".vercel.app" cubre *cualquier* subdominio
  return allowedPatterns.some((pattern) => origin.includes(pattern));
}

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

// EmailEngine webhooks must be registered BEFORE Clerk middleware (no auth required)
app.use('/api/email/webhook/engine', emailEngineWebhookRoute);

// --- MIDDLEWARES GLOBALES ---
app.use(clerkMiddleware());
app.use(helmet({
  crossOriginResourcePolicy: false,
  frameguard: false,           // elimina X-Frame-Options para permitir framing cross-origin
  contentSecurityPolicy: false, // elimina CSP que bloquea frame-ancestors
}));
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
app.use(compression());

// Servir archivos estáticos (fotos DNI subidas, etc.)
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
app.use('/api/chat',              chatRoutes);
app.use('/api/email',             emailRoutes);
app.use('/api/shared-templates',  sharedTemplatesRoutes);
app.use('/api/whatsapp',          whatsappRoutes);
app.use('/api/documental',        documentalRoutes);
app.use('/api/clientes/invites',  clientInviteRoutes);
app.use('/api/facturacion',       facturacionRoutes);
app.use('/api/quipu',             quipuRoutes);

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
      console.warn('⚠️  GEMINI_API_KEY no configurada — importación de documentos y VantIA desactivados.');
    } else if (!geminiKey.startsWith('AIzaSy')) {
      console.error('❌ GEMINI_API_KEY inválida (debe empezar por AIzaSy...). La clave actual parece un token OAuth, no una API key de Google AI Studio. Obtén una en https://aistudio.google.com/apikey');
    } else {
      console.log('✅ GEMINI_API_KEY configurada correctamente.');
    }

    if (SHOULD_START_LOCAL_WATCHER) {
      startLocalFilesWatcher();
      migrateLocalFoldersStructure();
    }
    // Registrar arranque en trazabilidad
    try { await logServerStart(); } catch { /**/ }

    // Quipu auto-sync: run once after 30s (let DB settle), then every 30 min
    setTimeout(() => {
      syncAllQuipuUsers().catch(() => {});
      setInterval(() => syncAllQuipuUsers().catch(() => {}), 30 * 60 * 1000);
    }, 30_000);

    // Task reminder emails: daily digest at 08:00 via Resend
    scheduleTaskReminderJob();

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
