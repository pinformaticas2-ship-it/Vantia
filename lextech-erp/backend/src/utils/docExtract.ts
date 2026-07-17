/**
 * Extracción de texto de documentos — sin dependencias npm externas
 * Usa herramientas del sistema: pdftotext (poppler-utils), unzip, tesseract
 *
 * IMPORTANTE: todas las llamadas a procesos externos usan spawn (asíncrono),
 * nunca spawnSync. spawnSync bloquea el hilo único de Node mientras el
 * proceso hijo corre (segundos o minutos en OCR/render de PDF a 300 DPI),
 * dejando sin servicio a CUALQUIER otra petición del backend mientras tanto
 * — no solo para el usuario que sube el documento, para todos los usuarios
 * conectados. spawn + Promise deja el event loop libre entre medias.
 */
import { spawn } from 'child_process';
import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import AdmZip = require('adm-zip');

// ── Tipos soportados ──────────────────────────────────────────────────────────

export type DocFile = {
  name:     string;   // nombre original del archivo
  fullPath: string;   // ruta temporal donde está extraído
  ext:      string;   // extensión en minúsculas
  size:     number;   // bytes
};

export class DocExtractError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DocExtractError';
    this.code = code;
  }
}

export type RenderedPageImage = {
  path: string;
  mimeType: string;
  pageNumber: number;
};

// ── spawn asíncrono con la misma forma de retorno que spawnSync ────────────
// (.status, .stdout, .stderr, .error) para poder mover cada llamada a
// spawnSync -> spawnAsync sin reescribir la lógica de cada caller.
type SpawnResult = { status: number | null; stdout: Buffer; stderr: Buffer; error?: Error };

function spawnAsync(command: string, args: string[], opts: { timeout?: number; maxBuffer?: number } = {}): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const maxBuffer = opts.maxBuffer ?? 10 * 1024 * 1024;
    let child;
    try {
      child = spawn(command, args, { windowsHide: true });
    } catch (error: any) {
      resolve({ status: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: SpawnResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutLen += chunk.length;
      if (stdoutLen <= maxBuffer) stdoutChunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrLen += chunk.length;
      if (stderrLen <= maxBuffer) stderrChunks.push(chunk);
    });
    child.on('error', (error) => {
      finish({ status: null, stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), error });
    });
    child.on('close', (code) => {
      finish({ status: code, stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks) });
    });

    if (opts.timeout) {
      timer = setTimeout(() => {
        try { child.kill(); } catch { /**/ }
        finish({
          status: null,
          stdout: Buffer.concat(stdoutChunks),
          stderr: Buffer.concat(stderrChunks),
          error: new Error(`Tiempo de espera agotado (${opts.timeout}ms) ejecutando ${command}`),
        });
      }, opts.timeout);
    }
  });
}

// ── Extraer ZIP ───────────────────────────────────────────────────────────────

export async function extractZip(zipPath: string): Promise<{ dir: string; files: DocFile[] }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lextech-zip-'));
  await extractArchive(zipPath, dir);

  const files = getAllFiles(dir)
    .filter(f => !path.basename(f).startsWith('__MACOSX') &&
                 !path.basename(f).startsWith('.'))
    .map(f => ({
      name:     path.basename(f),
      fullPath: f,
      ext:      path.extname(f).toLowerCase(),
      size:     fs.statSync(f).size,
    }))
    .filter(f => SUPPORTED_EXTS.includes(f.ext));

  return { dir, files };
}

function getAllFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...getAllFiles(full));
    else out.push(full);
  }
  return out;
}

const SUPPORTED_EXTS = ['.pdf', '.docx', '.doc', '.txt', '.text', '.rtf',
  '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'];

async function extractArchive(archivePath: string, destinationDir: string): Promise<void> {
  try {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(destinationDir, true);
    return;
  } catch (zipError: any) {
    console.warn(`[docExtract] Fallback a utilidades del sistema para ZIP: ${zipError?.message || zipError}`);
  }

  if (process.platform === 'win32') {
    const needsZipAlias = path.extname(archivePath).toLowerCase() !== '.zip';
    const zipPath = needsZipAlias ? `${archivePath}.zip` : archivePath;
    if (needsZipAlias) fs.copyFileSync(archivePath, zipPath);
    const result = await spawnAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
      ],
      { timeout: 60_000, maxBuffer: 100 * 1024 * 1024 },
    );
    if (needsZipAlias) {
      try { fs.unlinkSync(zipPath); } catch { /**/ }
    }
    if (result.status !== 0) {
      throw new Error(result.stderr?.toString('utf-8')?.trim() || 'Expand-Archive falló');
    }
    return;
  }

  const result = await spawnAsync('unzip', ['-o', archivePath, '-d', destinationDir], {
    timeout: 60_000,
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.status !== 0 && result.error) {
    throw new Error(`unzip falló: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString('utf-8')?.trim() || 'unzip falló');
  }
}

// Cachea la ruta resuelta de cada comando (tesseract/pdftotext/pdftoppm/...):
// antes se relanzaba "where"/"which" en cada archivo/página, multiplicando
// llamadas a spawn innecesarias — el resultado nunca cambia durante un run.
const resolvedCommandCache = new Map<string, string | null>();

async function resolveCommand(command: string): Promise<string | null> {
  if (resolvedCommandCache.has(command)) return resolvedCommandCache.get(command)!;

  const resolved = await resolveCommandUncached(command);
  resolvedCommandCache.set(command, resolved);
  return resolved;
}

async function resolveCommandUncached(command: string): Promise<string | null> {
  if (process.platform === 'win32') {
    const windowsCandidates: Record<string, string[]> = {
      tesseract: [
        process.env.TESSERACT_PATH || '',
        'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
        'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
      ],
      pdftotext: [
        process.env.PDFTOTEXT_PATH || '',
        'C:\\Users\\INFORMÁTICO2\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftotext.exe',
      ],
      pdftoppm: [
        process.env.PDFTOPPM_PATH || '',
        'C:\\Users\\INFORMÁTICO2\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftoppm.exe',
      ],
      pdftocairo: [
        process.env.PDFTOCAIRO_PATH || '',
        'C:\\Users\\INFORMÁTICO2\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftocairo.exe',
      ],
    };

    const directCandidate = windowsCandidates[command]?.find((candidate) => candidate && fs.existsSync(candidate));
    if (directCandidate) return directCandidate;
  }

  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = await spawnAsync(checker, [command], { timeout: 3000 });
  if (result.status !== 0) return null;

  const resolved = result.stdout?.toString('utf-8')?.split(/\r?\n/).find(Boolean)?.trim();
  return resolved || null;
}

// ── Extraer texto ─────────────────────────────────────────────────────────────

export async function extractTextFromFile(file: DocFile): Promise<string> {
  try {
    if (file.ext === '.pdf') return await extractPdf(file.fullPath);
    if (['.docx', '.doc'].includes(file.ext)) return await extractDocx(file.fullPath);
    if (['.txt', '.text', '.rtf'].includes(file.ext)) {
      return fs.readFileSync(file.fullPath, 'utf-8').slice(0, 50_000);
    }
    if (['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'].includes(file.ext)) {
      return await extractImageOcr(file.fullPath);
    }
  } catch (e: any) {
    console.warn(`[docExtract] Error extrayendo ${file.name}: ${e.message}`);
    throw e;
  }
  return '';
}

// ── PDF via pdftotext (poppler-utils) ─────────────────────────────────────────

async function extractPdf(filePath: string): Promise<string> {
  const pdftotextCmd = await resolveCommand('pdftotext');
  if (!pdftotextCmd) {
    return extractPdfViaOcr(filePath, true);
  }

  const result = await spawnAsync(pdftotextCmd, ['-layout', '-enc', 'UTF-8', filePath, '-'], {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    // Intentar sin -layout como fallback
    const r2 = await spawnAsync(pdftotextCmd, ['-enc', 'UTF-8', filePath, '-'], {
      timeout: 30_000, maxBuffer: 10 * 1024 * 1024,
    });
    const fallbackText = (r2.stdout?.toString('utf-8') || '').slice(0, 50_000);
    if (fallbackText.trim()) return fallbackText;
    return extractPdfViaOcr(filePath, false);
  }
  const text = (result.stdout?.toString('utf-8') || '').slice(0, 50_000);
  if (text.trim()) return text;
  return extractPdfViaOcr(filePath, false);
}

async function extractPdfViaOcr(filePath: string, _pdftotextUnavailable: boolean): Promise<string> {
  const pageImages = await renderPdfPagesToImages(filePath);
  try {
    const chunks: string[] = [];
    for (const page of pageImages) {
      const chunk = await extractImageOcr(page.path);
      if (chunk.trim()) chunks.push(chunk);
    }
    const merged = chunks.join('\n\n');

    if (!merged.trim()) {
      throw new DocExtractError(
        'ocr_no_text',
        'El OCR del PDF se ejecutó, pero no logró extraer texto legible del documento.',
      );
    }

    return merged.slice(0, 50_000);
  } finally {
    cleanupRenderedPageImages(pageImages);
  }
}

export async function renderPdfPagesToImages(filePath: string, maxPages = 8): Promise<RenderedPageImage[]> {
  const pdftoppmCmd = await resolveCommand('pdftoppm');
  const pdftocairoCmd = await resolveCommand('pdftocairo');
  const pdfRenderer = pdftoppmCmd || pdftocairoCmd || '';
  if (!pdfRenderer) {
    throw new DocExtractError(
      'missing_pdf_renderer',
      'No se pudo convertir el PDF a imagen para OCR porque faltan pdftoppm o pdftocairo.',
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lextech-pdf-ocr-'));
  const prefix = path.join(tmpDir, 'page');
  // 300 DPI para máxima calidad OCR (especialmente importante en documentos escaneados y manuscritos)
  const renderArgs = pdfRenderer === pdftoppmCmd
    ? ['-png', '-r', '300', '-f', '1', '-l', String(maxPages), filePath, prefix]
    : ['-png', '-r', '300', '-f', '1', '-l', String(maxPages), filePath, prefix];
  const render = await spawnAsync(pdfRenderer, renderArgs, {
    timeout: 120_000,
    maxBuffer: 200 * 1024 * 1024,
  });
  if (render.status !== 0) {
    throw new DocExtractError(
      'pdf_render_failed',
      render.stderr?.toString('utf-8')?.trim() || 'Falló la conversión del PDF a imagen para OCR.',
    );
  }

  const pagePaths = fs.readdirSync(tmpDir)
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((name) => path.join(tmpDir, name))
    .slice(0, maxPages);

  if (!pagePaths.length) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /**/ }
    throw new DocExtractError(
      'pdf_render_failed',
      'La conversión del PDF a imagen terminó sin generar páginas PNG.',
    );
  }

  return pagePaths.map((pagePath, index) => ({
    path: pagePath,
    mimeType: 'image/png',
    pageNumber: index + 1,
  }));
}

export function cleanupRenderedPageImages(pageImages: RenderedPageImage[]) {
  const parentDirs = new Set(
    pageImages
      .map((page) => path.dirname(page.path))
      .filter(Boolean),
  );
  for (const dir of parentDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /**/ }
  }
}

// ── DOCX via unzip + XML ──────────────────────────────────────────────────────

async function extractDocx(filePath: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lextech-docx-'));
  try {
    await extractArchive(filePath, tmpDir);
    const xmlPath = path.join(tmpDir, 'word', 'document.xml');
    if (!fs.existsSync(xmlPath)) return '';
    const xml = fs.readFileSync(xmlPath, 'utf-8');
    return xmlToText(xml).slice(0, 50_000);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /**/ }
  }
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:p[ >][^>]*>/g, '\n')   // párrafo → salto de línea
    .replace(/<[^>]+>/g, '')             // eliminar todas las etiquetas
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x[0-9A-Fa-f]+;/g, ' ')  // entidades hex
    .replace(/&#[0-9]+;/g, ' ')          // entidades decimales
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── OCR via Tesseract ─────────────────────────────────────────────────────────

export async function extractImageOcr(filePath: string): Promise<string> {
  // Intentar con tesseract CLI si está disponible
  const tesseractCmd = await resolveCommand('tesseract');
  if (tesseractCmd) {
    const outBase = path.join(os.tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    // --oem 1 = LSTM neural net (mejor para manuscritos y docs escaneados)
    // --psm 6 = asume bloque uniforme de texto (más preciso que auto)
    // -l spa+eng = español + inglés para documentos mixtos
    const result = await spawnAsync(
      tesseractCmd,
      [filePath, outBase, '-l', 'spa+eng', '--oem', '1', '--psm', '6'],
      { timeout: 90_000 },
    );
    const outFile = `${outBase}.txt`;
    if (fs.existsSync(outFile)) {
      const text = fs.readFileSync(outFile, 'utf-8');
      try { fs.unlinkSync(outFile); } catch { /**/ }
      if (text.trim()) return text.slice(0, 50_000);
    }
    // Fallback: modo auto (--psm 3) si --psm 6 no devuelve nada
    const outBase2 = path.join(os.tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_b`);
    await spawnAsync(tesseractCmd, [filePath, outBase2, '-l', 'spa+eng', '--oem', '1', '--psm', '3'], {
      timeout: 90_000,
    });
    const outFile2 = `${outBase2}.txt`;
    if (fs.existsSync(outFile2)) {
      const text2 = fs.readFileSync(outFile2, 'utf-8');
      try { fs.unlinkSync(outFile2); } catch { /**/ }
      if (text2.trim()) return text2.slice(0, 50_000);
    }
    // Ultimo fallback: stdout directo
    return (result.stdout?.toString() || '').slice(0, 50_000);
  }
  throw new DocExtractError(
    'missing_tesseract',
    'No se pudo hacer OCR de la imagen porque falta tesseract en el sistema.',
  );
}

// -- Limpieza de directorio temporal --

export function cleanupDir(dir: string) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /**/ }
}
