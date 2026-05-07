"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocExtractError = void 0;
exports.extractZip = extractZip;
exports.extractTextFromFile = extractTextFromFile;
exports.renderPdfPagesToImages = renderPdfPagesToImages;
exports.cleanupRenderedPageImages = cleanupRenderedPageImages;
exports.extractImageOcr = extractImageOcr;
exports.cleanupDir = cleanupDir;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const AdmZip = require("adm-zip");
class DocExtractError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DocExtractError';
        this.code = code;
    }
}
exports.DocExtractError = DocExtractError;
function extractZip(zipPath) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lextech-zip-'));
    extractArchive(zipPath, dir);
    const files = getAllFiles(dir)
        .filter(f => !path.basename(f).startsWith('__MACOSX') &&
        !path.basename(f).startsWith('.'))
        .map(f => ({
        name: path.basename(f),
        fullPath: f,
        ext: path.extname(f).toLowerCase(),
        size: fs.statSync(f).size,
    }))
        .filter(f => SUPPORTED_EXTS.includes(f.ext));
    return { dir, files };
}
function getAllFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            out.push(...getAllFiles(full));
        else
            out.push(full);
    }
    return out;
}
const SUPPORTED_EXTS = ['.pdf', '.docx', '.doc', '.txt', '.text', '.rtf',
    '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'];
function extractArchive(archivePath, destinationDir) {
    try {
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(destinationDir, true);
        return;
    }
    catch (zipError) {
        console.warn(`[docExtract] Fallback a utilidades del sistema para ZIP: ${zipError?.message || zipError}`);
    }
    if (process.platform === 'win32') {
        const needsZipAlias = path.extname(archivePath).toLowerCase() !== '.zip';
        const zipPath = needsZipAlias ? `${archivePath}.zip` : archivePath;
        if (needsZipAlias)
            fs.copyFileSync(archivePath, zipPath);
        const result = (0, child_process_1.spawnSync)('powershell.exe', [
            '-NoProfile',
            '-Command',
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
        ], { timeout: 60000, maxBuffer: 100 * 1024 * 1024 });
        if (needsZipAlias) {
            try {
                fs.unlinkSync(zipPath);
            }
            catch { }
        }
        if (result.status !== 0) {
            throw new Error(result.stderr?.toString('utf-8')?.trim() || 'Expand-Archive falló');
        }
        return;
    }
    const result = (0, child_process_1.spawnSync)('unzip', ['-o', archivePath, '-d', destinationDir], {
        timeout: 60000,
        maxBuffer: 100 * 1024 * 1024,
    });
    if (result.status !== 0 && result.error) {
        throw new Error(`unzip falló: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(result.stderr?.toString('utf-8')?.trim() || 'unzip falló');
    }
}
function commandExists(command) {
    return Boolean(resolveCommand(command));
}
function resolveCommand(command) {
    if (process.platform === 'win32') {
        const windowsCandidates = {
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
        if (directCandidate)
            return directCandidate;
    }
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const result = (0, child_process_1.spawnSync)(checker, [command], { timeout: 3000 });
    if (result.status !== 0)
        return null;
    const resolved = result.stdout?.toString('utf-8')?.split(/\r?\n/).find(Boolean)?.trim();
    return resolved || null;
}
function extractTextFromFile(file) {
    try {
        if (file.ext === '.pdf')
            return extractPdf(file.fullPath);
        if (['.docx', '.doc'].includes(file.ext))
            return extractDocx(file.fullPath);
        if (['.txt', '.text', '.rtf'].includes(file.ext)) {
            return fs.readFileSync(file.fullPath, 'utf-8').slice(0, 50000);
        }
        if (['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'].includes(file.ext)) {
            return extractImageOcr(file.fullPath);
        }
    }
    catch (e) {
        console.warn(`[docExtract] Error extrayendo ${file.name}: ${e.message}`);
        throw e;
    }
    return '';
}
function extractPdf(filePath) {
    const pdftotextCmd = resolveCommand('pdftotext');
    if (!pdftotextCmd) {
        return extractPdfViaOcr(filePath, true);
    }
    const result = (0, child_process_1.spawnSync)(pdftotextCmd, ['-layout', '-enc', 'UTF-8', filePath, '-'], {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status !== 0) {
        const r2 = (0, child_process_1.spawnSync)(pdftotextCmd, ['-enc', 'UTF-8', filePath, '-'], {
            timeout: 30000, maxBuffer: 10 * 1024 * 1024,
        });
        const fallbackText = (r2.stdout?.toString('utf-8') || '').slice(0, 50000);
        if (fallbackText.trim())
            return fallbackText;
        return extractPdfViaOcr(filePath, false);
    }
    const text = (result.stdout?.toString('utf-8') || '').slice(0, 50000);
    if (text.trim())
        return text;
    return extractPdfViaOcr(filePath, false);
}
function extractPdfViaOcr(filePath, pdftotextUnavailable) {
    const pageImages = renderPdfPagesToImages(filePath);
    try {
        const merged = pageImages
            .map((page) => extractImageOcr(page.path))
            .filter((chunk) => chunk.trim())
            .join('\n\n');
        if (!merged.trim()) {
            throw new DocExtractError('ocr_no_text', 'El OCR del PDF se ejecutó, pero no logró extraer texto legible del documento.');
        }
        return merged.slice(0, 50000);
    }
    finally {
        cleanupRenderedPageImages(pageImages);
    }
}
function renderPdfPagesToImages(filePath, maxPages = 8) {
    const pdftoppmCmd = resolveCommand('pdftoppm');
    const pdftocairoCmd = resolveCommand('pdftocairo');
    const pdfRenderer = pdftoppmCmd || pdftocairoCmd || '';
    if (!pdfRenderer) {
        throw new DocExtractError('missing_pdf_renderer', 'No se pudo convertir el PDF a imagen para OCR porque faltan pdftoppm o pdftocairo.');
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lextech-pdf-ocr-'));
    const prefix = path.join(tmpDir, 'page');
    const renderArgs = pdfRenderer === pdftoppmCmd
        ? ['-png', '-r', '300', '-f', '1', '-l', String(maxPages), filePath, prefix]
        : ['-png', '-r', '300', '-f', '1', '-l', String(maxPages), filePath, prefix];
    const render = (0, child_process_1.spawnSync)(pdfRenderer, renderArgs, {
        timeout: 120000,
        maxBuffer: 200 * 1024 * 1024,
    });
    if (render.status !== 0) {
        throw new DocExtractError('pdf_render_failed', render.stderr?.toString('utf-8')?.trim() || 'Falló la conversión del PDF a imagen para OCR.');
    }
    const pagePaths = fs.readdirSync(tmpDir)
        .filter((name) => name.toLowerCase().endsWith('.png'))
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((name) => path.join(tmpDir, name))
        .slice(0, maxPages);
    if (!pagePaths.length) {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        catch { }
        throw new DocExtractError('pdf_render_failed', 'La conversión del PDF a imagen terminó sin generar páginas PNG.');
    }
    return pagePaths.map((pagePath, index) => ({
        path: pagePath,
        mimeType: 'image/png',
        pageNumber: index + 1,
    }));
}
function cleanupRenderedPageImages(pageImages) {
    const parentDirs = new Set(pageImages
        .map((page) => path.dirname(page.path))
        .filter(Boolean));
    for (const dir of parentDirs) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        catch { }
    }
}
function extractDocx(filePath) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lextech-docx-'));
    try {
        extractArchive(filePath, tmpDir);
        const xmlPath = path.join(tmpDir, 'word', 'document.xml');
        if (!fs.existsSync(xmlPath))
            return '';
        const xml = fs.readFileSync(xmlPath, 'utf-8');
        return xmlToText(xml).slice(0, 50000);
    }
    finally {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        catch { }
    }
}
function xmlToText(xml) {
    return xml
        .replace(/<w:p[ >][^>]*>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x[0-9A-Fa-f]+;/g, ' ')
        .replace(/&#[0-9]+;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function extractImageOcr(filePath) {
    const tesseractCmd = resolveCommand('tesseract');
    if (tesseractCmd) {
        const outBase = path.join(os.tmpdir(), `ocr_${Date.now()}`);
        const result = (0, child_process_1.spawnSync)(tesseractCmd, [filePath, outBase, '-l', 'spa+eng', '--oem', '1', '--psm', '6'], { timeout: 90000 });
        const outFile = `${outBase}.txt`;
        if (fs.existsSync(outFile)) {
            const text = fs.readFileSync(outFile, 'utf-8');
            try {
                fs.unlinkSync(outFile);
            }
            catch { }
            if (text.trim())
                return text.slice(0, 50000);
        }
        const outBase2 = path.join(os.tmpdir(), `ocr_${Date.now()}_b`);
        (0, child_process_1.spawnSync)(tesseractCmd, [filePath, outBase2, '-l', 'spa+eng', '--oem', '1', '--psm', '3'], {
            timeout: 90000,
        });
        const outFile2 = `${outBase2}.txt`;
        if (fs.existsSync(outFile2)) {
            const text2 = fs.readFileSync(outFile2, 'utf-8');
            try {
                fs.unlinkSync(outFile2);
            }
            catch { }
            if (text2.trim())
                return text2.slice(0, 50000);
        }
        return (result.stdout?.toString() || '').slice(0, 50000);
    }
    throw new DocExtractError('missing_tesseract', 'No se pudo hacer OCR de la imagen porque falta tesseract en el sistema.');
}
function cleanupDir(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    catch { }
}
