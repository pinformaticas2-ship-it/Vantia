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
});

pool.on('error', (err: any) => {
  console.error('🔥 Error en el Pool de PG:', err);
});

export default pool;