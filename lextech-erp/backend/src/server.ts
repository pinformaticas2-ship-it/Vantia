import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import entityRoutes from './routes/entities';
import ocrRoutes from './routes/ocr';
import activityRoutes from './routes/activity';
import vantiaRoutes from './routes/vantia';
import filesRoutes from './routes/files';
import tasksRoutes from './routes/tasks';
import expedientesRoutes from './routes/expedientes';
import { runMigrations } from './config/migrations';
import { startLocalFilesWatcher } from './watchers/localFilesWatcher';
import pool from './config/database';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// --- MIDDLEWARES GLOBALES ---
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
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
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// --- RUTAS ---
app.use('/api/entities', entityRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/vantia', vantiaRoutes);
app.use('/api/files',  filesRoutes);
app.use('/api/tasks',       tasksRoutes);
app.use('/api/expedientes', expedientesRoutes);

// Health check básico
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Health check de base de datos — visita http://localhost:4000/api/health/db para diagnosticar
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
  if (err.status === 401 || err.message === 'Unauthenticated') {
    return res.status(401).json({ success: false, error: 'Sesión no válida o expirada' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
  }
  console.error('❌ Error:', err.stack || err.message);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// Arrancar servidor después de ejecutar migraciones
runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`🛡️  VANTIA Backend corriendo en http://localhost:${PORT}`);
    startLocalFilesWatcher();
  });
});
