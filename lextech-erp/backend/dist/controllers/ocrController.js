"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanDNI = void 0;
const tesseract_js_1 = require("tesseract.js");
const fs_1 = __importDefault(require("fs"));
function parseDNIText(raw) {
    const text = raw.toUpperCase();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const nifMatch = text.match(/\b([XYZ]\d{7}[A-Z]|\d{8}[A-Z])\b/);
    const nif_cif = nifMatch ? nifMatch[1] : null;
    let first_name = null;
    let last_name = null;
    const mrzLine = lines.find(l => l.includes('<<') && l.length > 15 && /^[A-Z<\s]+$/.test(l));
    if (mrzLine) {
        const clean = mrzLine.replace(/\s/g, '');
        const parts = clean.split('<<').filter(Boolean);
        if (parts[0])
            last_name = parts[0].replace(/</g, ' ').trim();
        if (parts[1])
            first_name = parts[1].replace(/</g, ' ').trim();
    }
    if (!last_name) {
        const m = text.match(/APELLIDOS?\s*[:\-]?\s*([A-ZÁÉÍÓÚÜÑ ]{3,})/);
        if (m)
            last_name = m[1].trim();
    }
    if (!first_name) {
        const m = text.match(/NOMBRE\s*[:\-]?\s*([A-ZÁÉÍÓÚÜÑ ]{2,})/);
        if (m)
            first_name = m[1].trim();
    }
    let birth_date = null;
    const dateMatch = text.match(/\b(\d{2})[\s\-\/](\d{2})[\s\-\/](\d{4})\b/);
    if (dateMatch)
        birth_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
    let address_town = null;
    const townMatch = text.match(/(?:MUNICIPIO|LOCALIDAD|LUGAR DE NACIMIENTO|LUGAR NAC\.?)\s*[:\-]?\s*([A-ZÁÉÍÓÚÜÑ ]{3,})/);
    if (townMatch)
        address_town = townMatch[1].trim();
    return { first_name, last_name, nif_cif, birth_date, address_town };
}
const scanDNI = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
    }
    const tempPath = req.file.path;
    let worker = null;
    try {
        worker = await (0, tesseract_js_1.createWorker)(['spa', 'eng'], 1, {
            logger: () => { },
        });
        const { data: { text } } = await worker.recognize(tempPath);
        const extracted = parseDNIText(text);
        return res.json({ success: true, data: extracted });
    }
    catch (error) {
        console.error('❌ Error OCR Tesseract:', error.message);
        return res.status(500).json({
            success: false,
            error: 'No se pudo procesar la imagen. Asegúrate de que sea clara y esté bien iluminada.',
        });
    }
    finally {
        if (worker)
            await worker.terminate().catch(() => { });
        try {
            fs_1.default.unlinkSync(tempPath);
        }
        catch { }
    }
};
exports.scanDNI = scanDNI;
