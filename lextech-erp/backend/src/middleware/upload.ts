import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { UPLOADS_DNIS_ROOT, UPLOADS_ORG_LOGOS_ROOT } from '../config/paths';

// Asegurarnos de que existe la carpeta donde guardaremos los DNIs
const uploadDir = UPLOADS_DNIS_ROOT;
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configurar cómo y dónde se guardan
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // Guardar en la carpeta uploads/dnis
    },
    filename: function (req, file, cb) {
        // Renombramos el archivo para que no haya duplicados (Ej: dni-167890.jpg)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'dni-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Filtro de seguridad: Solo aceptar imágenes
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Formato no soportado. Sube solo imágenes (JPG, PNG).') as any, false);
    }
};

export const uploadDNI = multer({ storage: storage, fileFilter: fileFilter });

// ── Logo de organización (despacho) ─────────────────────────────────────────
if (!fs.existsSync(UPLOADS_ORG_LOGOS_ROOT)) {
  fs.mkdirSync(UPLOADS_ORG_LOGOS_ROOT, { recursive: true });
}
const orgLogoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_ORG_LOGOS_ROOT);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});
export const uploadOrgLogo = multer({ storage: orgLogoStorage, fileFilter: fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
