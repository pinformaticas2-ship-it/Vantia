import multer from 'multer';

// memoryStorage (no diskStorage): el disco de Railway es efímero y se borra
// en cada redeploy/reinicio. Las fotos de DNI y los logos de organización se
// guardan en la base de datos (tabla misc_uploads, ver utils/miscUploads.ts)
// en vez de en disco -- el buffer llega en req.file.buffer y el nombre de
// archivo se genera en el controlador que llama a saveMiscUpload().

// Filtro de seguridad: Solo aceptar imágenes -- excepto SVG. Un SVG es XML,
// no una imagen rasterizada: puede llevar <script> dentro, y como luego se
// sirve de vuelta con el mismo Content-Type que se declaró al subirlo, un
// navegador lo ejecutaría. Nadie sube un DNI o un logo en SVG de verdad.
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
    if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
        cb(null, true);
    } else {
        cb(new Error('Formato no soportado. Sube solo imágenes (JPG, PNG).') as any, false);
    }
};

export const uploadDNI = multer({ storage: multer.memoryStorage(), fileFilter: fileFilter });

// ── Logo de organización (despacho) ─────────────────────────────────────────
export const uploadOrgLogo = multer({ storage: multer.memoryStorage(), fileFilter: fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
