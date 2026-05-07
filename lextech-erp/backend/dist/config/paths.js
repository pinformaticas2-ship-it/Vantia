"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHOULD_START_LOCAL_WATCHER = exports.TEMP_ROOT = exports.CLIENT_FILES_ROOT = exports.UPLOADS_DNIS_ROOT = exports.UPLOADS_CHAT_ROOT = exports.UPLOADS_CLIENTS_ROOT = exports.UPLOADS_ROOT = exports.DATA_ROOT = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
function ensureDir(dirPath) {
    if (!fs_1.default.existsSync(dirPath)) {
        fs_1.default.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}
const dataRoot = process.env.DATA_ROOT
    ? path_1.default.resolve(process.env.DATA_ROOT)
    : path_1.default.join(process.cwd(), 'storage');
const uploadsRoot = process.env.UPLOADS_DIR
    ? path_1.default.resolve(process.env.UPLOADS_DIR)
    : path_1.default.join(dataRoot, 'uploads');
const clientFilesRoot = process.env.CLIENT_FILES_PATH
    ? path_1.default.resolve(process.env.CLIENT_FILES_PATH)
    : path_1.default.join(dataRoot, 'client-files');
const tempRoot = process.env.TEMP_DIR
    ? path_1.default.resolve(process.env.TEMP_DIR)
    : path_1.default.join(os_1.default.tmpdir(), 'vantia-temp');
exports.DATA_ROOT = ensureDir(dataRoot);
exports.UPLOADS_ROOT = ensureDir(uploadsRoot);
exports.UPLOADS_CLIENTS_ROOT = ensureDir(path_1.default.join(exports.UPLOADS_ROOT, 'clients'));
exports.UPLOADS_CHAT_ROOT = ensureDir(path_1.default.join(exports.UPLOADS_ROOT, 'chat'));
exports.UPLOADS_DNIS_ROOT = ensureDir(path_1.default.join(exports.UPLOADS_ROOT, 'dnis'));
exports.CLIENT_FILES_ROOT = ensureDir(clientFilesRoot);
exports.TEMP_ROOT = ensureDir(tempRoot);
exports.SHOULD_START_LOCAL_WATCHER = process.env.START_LOCAL_FILE_WATCHER === 'true' && process.env.RENDER !== 'true';
