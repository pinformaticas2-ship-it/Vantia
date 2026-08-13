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
import { syncAllQuipuUsers } from './controllers/quipuController';
import { clerkMiddleware } from '@clerk/express';
import { resolveOrg } from './middleware/resolveOrg';
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

// Patrones siempre activos (independiente de env vars)
const HARDCODED_PATTERNS = ['.vercel.app', 'localhost', '127.0.0.1'];
const allowedPatterns = [
  ...HARDCODED_PATTERNS,
  ...(process.env.CORS_ALLOWED_PATTERNS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean),
];

function isCorsAllowed(origin: string | undefined): boolean {
  if (!origin) return true;                          // mismo origen / curl
  if (allowedOrigins.length === 0) return true;      // modo permisivo total
  if (allowedOrigins.includes(origin)) return true;  // coincidencia exacta
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
// El endpoint de streaming de VantIA (SSE) queda FUERA por completo del
// middleware, no solo desactivado vía `filter`: compression() sobreescribe
// res.write/res.end/res._implicitHeader nada más entrar (para poder decidir
// si comprime al ver el primer chunk), y esa envoltura se queda puesta pase
// lo que pase con el filtro. Con una respuesta larga y en trozos como esta
// (muchos res.write() a lo largo de varios segundos) esa envoltura extra es
// justo el tipo de cosa que puede desordenar el framing HTTP y provocar
// cortes de conexión con el navegador. Saltarse compression() del todo para
// esta ruta, en vez de solo decirle "no comprimas", es la manera segura.
const compressionMw = compression();
app.use((req, res, next) => {
  if (req.path === '/api/vantia/chat/stream') return next();
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
app.use('/api/whatsapp',          whatsappRoutes);
app.use('/api/documental',        documentalRoutes);
app.use('/api/clientes/invites',  clientInviteRoutes);
app.use('/api/facturacion',       facturacionRoutes);
app.use('/api/quipu',             quipuRoutes);
app.use('/api/quick-links',       quickLinksRoutes);
app.use('/api/directorio',        directorioRoutes);
app.use('/api/organizacion',      organizacionRoutes);
app.use('/api/preferences',       preferencesRoutes);

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

// Diagnóstico temporal: SSE mínimo sin Gemini ni BD, mismo patrón exacto de
// cabeceras que /api/vantia/chat/stream, para aislar si el corte con
// net::ERR_HTTP2_PROTOCOL_ERROR es de la plataforma (Railway/Node con
// streaming largo por HTTP/2) o de algo específico del código de VantIA.
// Visitar directamente desde el navegador (sin auth, GET) y ver si en
// Network se completa "1..2..3..4..5..fin" o se corta igual.
app.get('/api/health/sse-test', (_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': connected\n\n');
  let n = 0;
  const timer = setInterval(() => {
    n++;
    res.write(`data: ${JSON.stringify({ n })}\n\n`);
    if (n >= 5) {
      clearInterval(timer);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  }, 1000);
  _req.on('close', () => clearInterval(timer));
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

// Diagnóstico temporal de VantIA: hace una llamada real y mínima a Gemini con
// la key configurada en ESTE entorno (Railway, no el .env local) y dice si
// responde o no -- sin exponer la key. Pensado para depurar "VantIA no
// contesta" sin depender de una sesión de navegador autenticada. Quitar una
// vez confirmado que todo funciona.
app.get('/api/health/vantia', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.json({ status: 'error', reason: 'GEMINI_API_KEY no está configurada en este entorno.' });

  // ?stream=1 prueba el mismo camino que usa chatVantiaStream de verdad
  // (fetch + res.body.getReader() sobre streamGenerateContent), para aislar
  // si el problema está en LEER el stream de Gemini en este runtime, o en
  // escribírselo al navegador (framing HTTP, proxy intermedio, etc.).
  if (req.query.stream) {
    const started = Date.now();
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Cuenta del 1 al 5' }] }] }),
        }
      );
      if (!r.ok || !r.body) {
        const data: any = await r.json().catch(() => ({}));
        return res.json({ status: 'error', httpStatus: r.status, googleError: data?.error?.message || 'sin body' });
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let chunks = 0, bytes = 0, text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks++;
        bytes += value.length;
        text += decoder.decode(value, { stream: true });
        if (Date.now() - started > 20000) { return res.json({ status: 'timeout', chunks, bytes, ms: Date.now() - started, sample: text.slice(0, 300) }); }
      }
      res.json({ status: 'ok', chunks, bytes, ms: Date.now() - started, sample: text.slice(0, 500) });
    } catch (e: any) {
      res.json({ status: 'error', ms: Date.now() - started, reason: e?.message || String(e) });
    }
    return;
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responde solo con la palabra: ok' }] }] }),
      }
    );
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.json({ status: 'error', httpStatus: r.status, googleError: data?.error?.message || JSON.stringify(data).slice(0, 300), keyPrefix: apiKey.slice(0, 6) });
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    res.json({ status: 'ok', sample: text, keyPrefix: apiKey.slice(0, 6) });
  } catch (e: any) {
    res.json({ status: 'error', reason: e?.message || String(e) });
  }
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
