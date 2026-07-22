import fs from 'fs';
import path from 'path';
import os from 'os';

function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

const dataRoot = process.env.DATA_ROOT
  ? path.resolve(process.env.DATA_ROOT)
  : path.join(process.cwd(), 'storage');

const uploadsRoot = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(dataRoot, 'uploads');

const clientFilesRoot = process.env.CLIENT_FILES_PATH
  ? path.resolve(process.env.CLIENT_FILES_PATH)
  : path.join(dataRoot, 'client-files');

const tempRoot = process.env.TEMP_DIR
  ? path.resolve(process.env.TEMP_DIR)
  : path.join(os.tmpdir(), 'vantia-temp');

export const DATA_ROOT = ensureDir(dataRoot);
export const UPLOADS_ROOT = ensureDir(uploadsRoot);
export const UPLOADS_CLIENTS_ROOT = ensureDir(path.join(UPLOADS_ROOT, 'clients'));
export const UPLOADS_CHAT_ROOT = ensureDir(path.join(UPLOADS_ROOT, 'chat'));
export const UPLOADS_DNIS_ROOT = ensureDir(path.join(UPLOADS_ROOT, 'dnis'));
export const UPLOADS_ORG_LOGOS_ROOT = ensureDir(path.join(UPLOADS_ROOT, 'org-logos'));
export const CLIENT_FILES_ROOT = ensureDir(clientFilesRoot);
export const TEMP_ROOT = ensureDir(tempRoot);

export const SHOULD_START_LOCAL_WATCHER =
  process.env.START_LOCAL_FILE_WATCHER === 'true' && process.env.RENDER !== 'true';
