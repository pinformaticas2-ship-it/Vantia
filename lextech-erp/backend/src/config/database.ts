import { Pool } from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';

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

const parsedUrl = new URL(rawUrl);
const shouldUseSsl = process.env.PGSSL === 'true' || rawUrl.includes('supabase.co');
const connectionFamily = Number(process.env.PG_FAMILY || (rawUrl.includes('supabase.co') ? 4 : 0)) || undefined;
const lookup = connectionFamily
  ? ((hostname: string, _options: any, callback: any) => dns.lookup(hostname, { family: connectionFamily }, callback))
  : undefined;

const pool = new Pool({
  connectionString: rawUrl,
  host: parsedUrl.hostname,
  port: parsedUrl.port ? Number(parsedUrl.port) : undefined,
  database: parsedUrl.pathname.replace(/^\//, '') || undefined,
  user: decodeURIComponent(parsedUrl.username || ''),
  password: decodeURIComponent(parsedUrl.password || ''),
  ...(connectionFamily ? { family: connectionFamily } : {}),
  ...(lookup ? { lookup } : {}),
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,

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
