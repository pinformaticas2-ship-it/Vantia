import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// 1. Limpieza de la variable
const rawUrl = process.env.DATABASE_URL?.trim().replace(/['"]/g, '');

if (!rawUrl) {
  console.error("❌ FATAL: DATABASE_URL no definida.");
  process.exit(-1);
}

// 2. Validación de Formato
try {
  new URL(rawUrl); 
  console.log("📡 URL de base de datos validada correctamente.");
} catch (err) {
  console.error("❌ ERROR: La URL en el .env sigue siendo inválida.");
  console.error("👉 Asegúrate de no usar caracteres como # o / sin codificar en la contraseña.");
  process.exit(-1);
}

const pool = new Pool({
  connectionString: rawUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,

  // ── Optimización del pool de conexiones ──────────────────
  max: 20,                        // Máximo de conexiones simultáneas (default era 10)
  idleTimeoutMillis: 30_000,      // Cerrar conexiones inactivas tras 30s
  connectionTimeoutMillis: 5_000, // Timeout al obtener conexión del pool
  allowExitOnIdle: false,         // Mantener pool activo mientras el servidor corra

  // Statement timeout global: evita queries infinitas (30 segundos)
  statement_timeout: 30_000,
});

pool.on('error', (err: any) => {
  console.error('🔥 Error en el Pool de PG:', err);
});

// Precalentar el pool: abrir conexiones al arrancar para evitar latencia en las primeras peticiones
(async () => {
  try {
    const warmup = await pool.connect();
    warmup.release();
    console.log('🔥 Pool de conexiones precalentado correctamente.');
  } catch (_e) {
    // No bloquea el arranque
  }
})();

export default pool;