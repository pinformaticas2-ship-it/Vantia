import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import entityRoutes from './routes/entities';
import ocrRoutes from './routes/ocr';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// --- MIDDLEWARES GLOBALES ---
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (fotos DNI subidas, etc.)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// --- RUTAS ---
app.use('/api/entities', entityRoutes);
app.use('/api/ocr', ocrRoutes);

// Health check — útil para verificar que el servidor está vivo
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`🛡️  VANTIA Backend corriendo en http://localhost:${PORT}`);
});
