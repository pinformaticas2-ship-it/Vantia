"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const dns_1 = __importDefault(require("dns"));
dotenv_1.default.config();
const rawUrl = process.env.DATABASE_URL?.trim().replace(/['"]/g, '');
if (!rawUrl) {
    console.error("❌ FATAL: DATABASE_URL no definida.");
    process.exit(-1);
}
try {
    new URL(rawUrl);
    console.log("📡 URL de base de datos validada correctamente.");
}
catch (err) {
    console.error("❌ ERROR: La URL en el .env sigue siendo inválida.");
    console.error("👉 Asegúrate de no usar caracteres como # o / sin codificar en la contraseña.");
    process.exit(-1);
}
const parsedUrl = new URL(rawUrl);
const shouldUseSsl = process.env.PGSSL === 'true' || rawUrl.includes('supabase.co');
const connectionFamily = Number(process.env.PG_FAMILY || (rawUrl.includes('supabase.co') ? 4 : 0)) || undefined;
const lookup = connectionFamily
    ? ((hostname, _options, callback) => dns_1.default.lookup(hostname, { family: connectionFamily }, callback))
    : undefined;
const pool = new pg_1.Pool({
    connectionString: rawUrl,
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : undefined,
    database: parsedUrl.pathname.replace(/^\//, '') || undefined,
    user: decodeURIComponent(parsedUrl.username || ''),
    password: decodeURIComponent(parsedUrl.password || ''),
    ...(connectionFamily ? { family: connectionFamily } : {}),
    ...(lookup ? { lookup } : {}),
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: false,
    statement_timeout: 30000,
});
pool.on('error', (err) => {
    console.error('🔥 Error en el Pool de PG:', err);
});
(async () => {
    try {
        const warmup = await pool.connect();
        warmup.release();
        console.log('🔥 Pool de conexiones precalentado correctamente.');
    }
    catch (_e) {
    }
})();
exports.default = pool;
