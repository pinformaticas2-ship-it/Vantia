import { Pool } from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

const rawUrl = process.env.DATABASE_URL?.trim().replace(/['"]/g, '');

if (!rawUrl) {
  console.error('FATAL: DATABASE_URL no definida.');
  process.exit(-1);
}

try {
  new URL(rawUrl);
  console.log('URL de base de datos validada correctamente.');
} catch {
  console.error('ERROR: La URL en el .env es inválida.');
  process.exit(-1);
}

const parsedUrl = new URL(rawUrl);
const isSupabase = rawUrl.includes('supabase.com') || rawUrl.includes('supabase.co');
const isSupabasePooler = parsedUrl.hostname.includes('pooler.supabase.com');
const shouldUseSsl = process.env.PGSSL === 'true' || isSupabase;
const connectionFamily = Number(process.env.PG_FAMILY || (isSupabase ? 4 : 0)) || undefined;
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
  max: isSupabasePooler ? 5 : 20,
  idleTimeoutMillis: isSupabasePooler ? 10_000 : 30_000,
  connectionTimeoutMillis: 15_000,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  statement_timeout: 30_000,
});

function isTransientPoolerError(error: any) {
  const message = String(error?.message || '');
  if (error?.code === 'XX000' && /DbHandler exited/i.test(message)) return true;
  if (/connection terminated due to connection timeout/i.test(message)) return true;
  return false;
}

const originalQuery = pool.query.bind(pool);
(pool as any).query = async (...args: any[]) => {
  try {
    return await originalQuery(...args);
  } catch (error: any) {
    if (isSupabasePooler && isTransientPoolerError(error)) {
      console.warn('Reintentando query tras fallo transitorio del pooler de Supabase...');
      return originalQuery(...args);
    }
    throw error;
  }
};

pool.on('error', (err: any) => {
  console.error('Error en el Pool de PG:', err);
});

(async () => {
  if (isSupabasePooler) return;
  try {
    const warmup = await pool.connect();
    warmup.release();
    console.log('Pool de conexiones precalentado correctamente.');
  } catch {
    // No bloquea el arranque
  }
})();

export default pool;
