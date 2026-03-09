import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

dotenv.config();
const app = express();
const PORT = 4000;

// Configuración de Base de Datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- MIDDLEWARES ---
app.use(helmet({
  crossOriginResourcePolicy: false, // Vital para que el navegador permita cargar fotos desde el backend
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Servir archivos estáticos: Ajustado para apuntar correctamente a la carpeta uploads
// Si tu estructura es backend/src/server.ts, la ruta ../../uploads sube dos niveles
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

/**
 * CORRECCIÓN REGLA DE ORO: Clerk ya no acepta { loose: true }.
 * Se inicializa sin argumentos para usar la configuración por defecto.
 */
const requireAuth = ClerkExpressRequireAuth();

// --- RUTAS DEL MÓDULO DE CLIENTES ---

// 1. GET: Listar Clientes
app.get('/api/entities', requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query('SELECT * FROM entities ORDER BY created_at DESC LIMIT 50');
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 2. GET: Detalle Cliente
app.get('/api/entities/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM entities WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "No encontrado" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});


// 3. POST: Crear Cliente (Corregido en server.ts)
app.post('/api/entities', requireAuth, async (req: any, res) => {
  // Extraemos TODO lo que viene del formulario
  const { 
    first_name, 
    last_name, 
    nif_cif, 
    email, 
    phone_1, 
    commercial_name, 
    type, 
    address_town 
  } = req.body;
  
  const userId = req.auth?.userId || 'SYSTEM';
  
  try {
    const result = await pool.query(
      `INSERT INTO entities (
        first_name, 
        last_name, 
        nif_cif, 
        email, 
        phone_1, 
        commercial_name, 
        type, 
        address_town, 
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [first_name, last_name, nif_cif, email, phone_1, commercial_name, type, address_town, userId]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    console.error("❌ ERROR DB:", e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * MANEJADOR DE ERRORES DE AUTENTICACIÓN
 * Indispensable para que Express no devuelva un HTML de error y el frontend sepa qué pasó.
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.message === 'Unauthenticated') {
    return res.status(401).json({ success: false, error: 'Sesión no válida o expirada' });
  }
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

app.listen(PORT, () => console.log(`🛡️ LEXTECH BACKEND: http://localhost:${PORT}`));