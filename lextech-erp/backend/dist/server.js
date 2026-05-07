"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const dotenv_1 = __importDefault(require("dotenv"));
const entities_1 = __importDefault(require("./routes/entities"));
const ocr_1 = __importDefault(require("./routes/ocr"));
const activity_1 = __importDefault(require("./routes/activity"));
const vantia_1 = __importDefault(require("./routes/vantia"));
const files_1 = __importDefault(require("./routes/files"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const expedientes_1 = __importDefault(require("./routes/expedientes"));
const agenda_1 = __importDefault(require("./routes/agenda"));
const chat_1 = __importDefault(require("./routes/chat"));
const email_1 = __importDefault(require("./routes/email"));
const whatsapp_1 = __importDefault(require("./routes/whatsapp"));
const documentImport_1 = __importDefault(require("./routes/documentImport"));
const documental_1 = __importDefault(require("./routes/documental"));
const clientInvite_1 = __importDefault(require("./routes/clientInvite"));
const migrations_1 = require("./config/migrations");
const localFilesWatcher_1 = require("./watchers/localFilesWatcher");
const filesController_1 = require("./controllers/filesController");
const activityController_1 = require("./controllers/activityController");
const database_1 = __importDefault(require("./config/database"));
const paths_1 = require("./config/paths");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: false }));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', (_req, res, next) => {
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
    });
    next();
});
app.use((0, compression_1.default)());
app.use('/uploads', express_1.default.static(paths_1.UPLOADS_ROOT));
app.use('/api/entities', entities_1.default);
app.use('/api/ocr', ocr_1.default);
app.use('/api/activity', activity_1.default);
app.use('/api/vantia', vantia_1.default);
app.use('/api/files', files_1.default);
app.use('/api/tasks', tasks_1.default);
app.use('/api/expedientes/documents', documentImport_1.default);
app.use('/api/expedientes', expedientes_1.default);
app.use('/api/agenda', agenda_1.default);
app.use('/api/chat', chat_1.default);
app.use('/api/email', email_1.default);
app.use('/api/whatsapp', whatsapp_1.default);
app.use('/api/documental', documental_1.default);
app.use('/api/clientes/invites', clientInvite_1.default);
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/health/storage', (_req, res) => {
    const fs = require('fs');
    const { UPLOADS_ROOT, CLIENT_FILES_ROOT, DATA_ROOT } = require('./config/paths');
    const check = (p) => ({ path: p, exists: fs.existsSync(p) });
    res.json({
        cwd: process.cwd(),
        DATA_ROOT_env: process.env.DATA_ROOT || '(no configurado)',
        paths: {
            DATA_ROOT: check(DATA_ROOT),
            UPLOADS_ROOT: check(UPLOADS_ROOT),
            CLIENT_FILES_ROOT: check(CLIENT_FILES_ROOT),
        }
    });
});
app.get('/api/health/db', async (_req, res) => {
    try {
        const result = await database_1.default.query(`
      SELECT
        current_database() AS db,
        current_user       AS user,
        NOW()              AS server_time,
        (SELECT COUNT(*) FROM entities) AS entity_count
    `);
        res.json({ status: 'ok', ...result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ status: 'error', error: err?.message || String(err) });
    }
});
app.use((err, _req, res, _next) => {
    if (err.status === 401 || err.message === 'Unauthenticated') {
        return res.status(401).json({ success: false, error: 'Sesión no válida o expirada' });
    }
    if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Este NIF/CIF ya está registrado.' });
    }
    console.error('❌ Error:', err.stack || err.message);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
});
(0, migrations_1.runMigrations)().then(() => {
    app.listen(PORT, async () => {
        console.log(`🛡️  VANTIA Backend corriendo en http://localhost:${PORT}`);
        if (paths_1.SHOULD_START_LOCAL_WATCHER) {
            (0, localFilesWatcher_1.startLocalFilesWatcher)();
            (0, filesController_1.migrateLocalFoldersStructure)();
        }
        try {
            await (0, activityController_1.logServerStart)();
        }
        catch { }
    });
});
