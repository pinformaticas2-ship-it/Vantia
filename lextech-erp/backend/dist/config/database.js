"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
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
const pool = new pg_1.Pool({
    connectionString: rawUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
