"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLocalFilesWatcher = startLocalFilesWatcher;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = __importDefault(require("../config/database"));
const LOCAL_ROOT = process.env.CLIENT_FILES_PATH
    ? path_1.default.resolve(process.env.CLIENT_FILES_PATH)
    : path_1.default.join(process.env.USERPROFILE || process.env.HOME || '', 'lextech-client-files');
const UPLOADS_ROOT = path_1.default.join(__dirname, '../../uploads/clients');
const pending = new Map();
function isTemp(name) {
    return (name.startsWith('~$') ||
        name.startsWith('~') ||
        name.endsWith('.tmp') ||
        name.endsWith('.TMP') ||
        name.startsWith('.'));
}
async function syncToServer(clientId, originalName) {
    const localPath = path_1.default.join(LOCAL_ROOT, clientId, originalName);
    if (!fs_1.default.existsSync(localPath))
        return;
    try {
        const { size } = fs_1.default.statSync(localPath);
        const result = await database_1.default.query(`SELECT stored_name FROM client_files WHERE client_id = $1 AND original_name = $2 LIMIT 1`, [clientId, originalName]);
        if (!result.rows.length)
            return;
        const { stored_name } = result.rows[0];
        const serverDir = path_1.default.join(UPLOADS_ROOT, clientId);
        const serverPath = path_1.default.join(serverDir, stored_name);
        if (!fs_1.default.existsSync(serverDir))
            fs_1.default.mkdirSync(serverDir, { recursive: true });
        fs_1.default.copyFileSync(localPath, serverPath);
        await database_1.default.query(`UPDATE client_files SET size_bytes = $1 WHERE client_id = $2 AND original_name = $3`, [size, clientId, originalName]);
        console.log(`✅ Auto-sync: ${clientId}/${originalName} (${size} bytes)`);
    }
    catch (err) {
        console.error(`❌ Auto-sync error [${clientId}/${originalName}]:`, err.message);
    }
}
function startLocalFilesWatcher() {
    if (!fs_1.default.existsSync(LOCAL_ROOT)) {
        console.log('ℹ️  Watcher no iniciado — la carpeta local aún no existe:', LOCAL_ROOT);
        return;
    }
    try {
        fs_1.default.watch(LOCAL_ROOT, { recursive: true }, (_event, filename) => {
            if (!filename)
                return;
            const parts = filename.split(/[\\/]/);
            if (parts.length < 2)
                return;
            const clientId = parts[0];
            const originalName = parts[1];
            if (!originalName || isTemp(originalName))
                return;
            const key = `${clientId}/${originalName}`;
            if (pending.has(key))
                clearTimeout(pending.get(key));
            pending.set(key, setTimeout(() => {
                pending.delete(key);
                syncToServer(clientId, originalName);
            }, 1500));
        });
        console.log('👁️  Watcher de cambios locales activo en:', LOCAL_ROOT);
    }
    catch (err) {
        console.error('❌ Error al iniciar watcher:', err.message);
    }
}
