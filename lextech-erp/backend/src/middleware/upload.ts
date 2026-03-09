import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Asegurarnos de que existe la carpeta donde guardaremos los DNIs
const uploadDir = path.join(__dirname, '../../../uploads/dnis');
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