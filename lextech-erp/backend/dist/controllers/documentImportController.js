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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDocumentImport = uploadDocumentImport;
exports.acceptDocumentImportItem = acceptDocumentImportItem;
exports.getDocumentImportBatch = getDocumentImportBatch;
exports.listDocumentImportBatches = listDocumentImportBatches;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const database_1 = __importDefault(require("../config/database"));
const generative_ai_1 = require("@google/generative-ai");
const openai_1 = __importDefault(require("openai"));
const docExtract_1 = require("../utils/docExtract");
const paths_1 = require("../config/paths");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const genAI = GEMINI_API_KEY ? new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY) : null;
const GEMINI_MODELS = ['gemini-2.5-flash'];
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const openaiClient = OPENAI_API_KEY ? new openai_1.default({ apiKey: OPENAI_API_KEY }) : null;
function userId(req) { return req.auth?.userId || 'SYSTEM'; }
function userName(req) { return req.auth?.name || 'Sistema'; }
const ok = (res, data) => res.json({ success: true, data });
const err = (res, msg, s = 500) => res.status(s).json({ success: false, error: msg });
const VALID_TIPOS = [
    'judicial', 'extrajudicial', 'monitorio', 'obligacion_hacer',
    'prejudicial', 'diligencias', 'penal', 'laboral', 'contencioso', 'otro',
];
const VALID_ESTADOS = ['abierto', 'cerrado', 'suspendido', 'archivado'];
function normalizeLooseSpanishDate(raw) {
    const value = String(raw || '').trim();
    if (!value)
        return null;
    const clean = value
        .replace(/[.]/g, '-')
        .replace(/[\/]/g, '-')
        .replace(/\s+/g, '')
        .replace(/[^\d-]/g, '');
    const match = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (!match)
        return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100)
        year += year >= 70 ? 1900 : 2000;
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100)
        return null;
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const parsed = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : iso;
}
function extractNotificadoDate(text) {
    const source = String(text || '');
    if (!source.trim())
        return null;
    const patterns = [
        /notificad[oa]\s*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
        /notificad[oa][^\d]{0,20}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
        /notif[il1]cad[oa][^\d]{0,20}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
        /notificad[oa]\s*\n\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
        /noti[f1l][i1l]?ca[dcl][oa]\s*[:\-]?\s*(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})/i,
        /noti[f1l][i1l]?ca[dcl][oa][^\d]{0,30}(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})/i,
    ];
    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match) {
            const normalized = normalizeLooseSpanishDate(match[1]);
            if (normalized)
                return normalized;
        }
    }
    const lines = source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!/noti[f1l][i1l]?(?:ca|ci)?[dcl]?[oa]?/i.test(line))
            continue;
        const windowText = [line, lines[index + 1] || '', lines[index + 2] || '']
            .filter(Boolean)
            .join(' ');
        const dateMatch = windowText.match(/(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})/);
        if (dateMatch) {
            const normalized = normalizeLooseSpanishDate(dateMatch[1]);
            if (normalized)
                return normalized;
        }
    }
    const broadMatch = source.match(/noti[f1l][i1l]?(?:ca|ci)?[dcl]?[oa]?[\s\S]{0,80}?(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})/i);
    if (broadMatch) {
        const normalized = normalizeLooseSpanishDate(broadMatch[1]);
        if (normalized)
            return normalized;
    }
    return null;
}
function extractStandaloneHandwrittenLikeDate(text) {
    const source = String(text || '');
    if (!source.trim())
        return null;
    const lines = source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 24);
    const blockedKeywords = [
        'nacimiento',
        'emision',
        'validez',
        'fecha alta',
        'fecha cierre',
        'vencimiento',
        'caducidad',
        'sentencia',
        'demanda',
        'procedimiento',
    ];
    for (const line of lines) {
        const normalizedLine = line
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        if (blockedKeywords.some((keyword) => normalizedLine.includes(keyword)))
            continue;
        const isolatedMatch = line.match(/^\D{0,6}(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})\D{0,6}$/);
        if (!isolatedMatch)
            continue;
        const normalized = normalizeLooseSpanishDate(isolatedMatch[1]);
        if (normalized)
            return normalized;
    }
    return null;
}
function extractDocumentLevelNotificationDate(text) {
    const source = String(text || '');
    if (!source.trim())
        return null;
    const normalizedSource = source
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const contextualPatterns = [
        /recibid[oa][^\d]{0,24}(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})/i,
        /entregad[oa][^\d]{0,24}(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})/i,
        /cedula[^\d]{0,32}(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})/i,
        /diligencia[^\d]{0,32}(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})/i,
    ];
    for (const pattern of contextualPatterns) {
        const match = normalizedSource.match(pattern);
        if (!match)
            continue;
        const normalized = normalizeLooseSpanishDate(match[1]);
        if (normalized)
            return normalized;
    }
    return null;
}
function runNotificationDateChecks(text) {
    return (extractNotificadoDate(text)
        || extractStandaloneHandwrittenLikeDate(text)
        || extractDocumentLevelNotificationDate(text)
        || null);
}
async function extractFocusedNotificationDate(file) {
    try {
        if (file.ext === '.pdf') {
            let firstPageImages = [];
            try {
                firstPageImages = (0, docExtract_1.renderPdfPagesToImages)(file.fullPath, 1);
                const firstPageText = firstPageImages
                    .map((page) => (0, docExtract_1.extractImageOcr)(page.path))
                    .filter((chunk) => chunk.trim())
                    .join('\n\n');
                const firstPageDate = runNotificationDateChecks(firstPageText);
                if (firstPageDate)
                    return firstPageDate;
            }
            finally {
                if (firstPageImages.length)
                    (0, docExtract_1.cleanupRenderedPageImages)(firstPageImages);
            }
            let allPageImages = [];
            try {
                allPageImages = (0, docExtract_1.renderPdfPagesToImages)(file.fullPath, 8);
                const remainingPagesText = allPageImages
                    .filter((page) => Number(page.pageNumber || 0) > 1)
                    .map((page) => (0, docExtract_1.extractImageOcr)(page.path))
                    .filter((chunk) => chunk.trim())
                    .join('\n\n');
                return runNotificationDateChecks(remainingPagesText);
            }
            finally {
                if (allPageImages.length)
                    (0, docExtract_1.cleanupRenderedPageImages)(allPageImages);
            }
        }
        if (['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'].includes(file.ext)) {
            const imageText = (0, docExtract_1.extractImageOcr)(file.fullPath);
            return runNotificationDateChecks(imageText);
        }
    }
    catch (error) {
        console.warn(`[documentImport] Capa extra de fecha de notificación falló en ${file.name}:`, String(error?.message || error || 'Error desconocido'));
    }
    return null;
}
function normalizePartyName(value) {
    return value
        .replace(/^\s*(d[.ªºa]*|don|doña)\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function splitPartyNames(value) {
    if (value == null)
        return null;
    const extractRawName = (input) => {
        if (typeof input === 'string' || typeof input === 'number')
            return String(input).trim();
        if (input && typeof input === 'object') {
            const obj = input;
            const candidate = obj.nombre ?? obj.name ?? obj.label ?? obj.razon_social ?? obj.value;
            if (typeof candidate === 'string' || typeof candidate === 'number')
                return String(candidate).trim();
        }
        return '';
    };
    const collectFromString = (raw) => {
        const cleaned = raw
            .replace(/\b(demandantes?|demandados?|parte actora|parte demandada|parte contraria)\b\s*:?/gi, '')
            .replace(/\s*\|\s*/g, '|')
            .replace(/\s*;\s*/g, ';')
            .trim();
        return cleaned
            .split(/\||;|\n+/)
            .flatMap((chunk) => chunk.split(/\s+y\s+(?=(?:d[.ªºa]*\s+)?[A-ZÁÉÍÓÚÜÑ])/))
            .map(normalizePartyName)
            .filter(Boolean);
    };
    const values = Array.isArray(value) ? value : [value];
    const flattened = values
        .flatMap((item) => collectFromString(extractRawName(item)))
        .filter(Boolean);
    const unique = flattened.filter((item, index) => flattened.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index);
    return unique.length ? unique : null;
}
function inferTipoAsuntoFromContent(text, tipoProc) {
    const source = `${String(tipoProc || '')}\n${String(text || '')}`.toLowerCase();
    if (!source.trim())
        return null;
    if (source.includes('cedula de emplazamiento') || source.includes('emplazamiento judicial'))
        return 'Cédula de emplazamiento';
    if (source.includes('demanda de juicio ordinario') || source.includes('procedimiento ordinario') || source.includes('juicio ordinario'))
        return 'Juicio ordinario';
    if (source.includes('juicio verbal'))
        return 'Juicio verbal';
    if (source.includes('monitorio'))
        return 'Procedimiento monitorio';
    if (source.includes('ejecucion'))
        return 'Ejecución';
    if (source.includes('desahucio'))
        return 'Desahucio';
    if (source.includes('reclamacion de cantidad'))
        return 'Reclamación de cantidad';
    if (source.includes('penal'))
        return 'Penal';
    if (source.includes('laboral') || source.includes('social'))
        return 'Social';
    if (source.includes('contencioso'))
        return 'Contencioso-administrativo';
    return null;
}
function inferDescripcionFromContent(text, tipoProc, juzgado) {
    const source = String(text || '');
    const lower = source.toLowerCase();
    const asunto = inferTipoAsuntoFromContent(source, tipoProc);
    if (lower.includes('cedula de emplazamiento') || lower.includes('emplazamiento judicial')) {
        return asunto
            ? `${asunto}${juzgado ? ` ante ${juzgado}` : ''}`
            : `Cédula de emplazamiento${juzgado ? ` ante ${juzgado}` : ''}`;
    }
    if (asunto) {
        return `${asunto}${juzgado ? ` ante ${juzgado}` : ''}`;
    }
    return null;
}
function hasMeaningfulExtractedData(data) {
    return Object.entries(data || {}).some(([key, value]) => {
        if (key === 'transcription')
            return false;
        return value !== null && value !== undefined && value !== '';
    });
}
function isRetryableGeminiError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return (message.includes('503') ||
        message.includes('service unavailable') ||
        message.includes('high demand') ||
        message.includes('try again later') ||
        message.includes('temporarily unavailable'));
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}
function addWorkingDaysFromIso(value, days = 0) {
    const base = String(value || '').slice(0, 10);
    if (!base)
        return null;
    const current = new Date(`${base}T00:00:00Z`);
    if (Number.isNaN(current.getTime()))
        return null;
    let remaining = Math.max(days, 0);
    while (remaining > 0) {
        current.setUTCDate(current.getUTCDate() + 1);
        if (!isWeekend(current))
            remaining -= 1;
    }
    return current.toISOString().slice(0, 10);
}
function subtractDaysFromIso(value, days = 0) {
    const base = String(value || '').slice(0, 10);
    if (!base)
        return null;
    const current = new Date(`${base}T00:00:00Z`);
    if (Number.isNaN(current.getTime()))
        return null;
    current.setUTCDate(current.getUTCDate() - Math.max(days, 0));
    return current.toISOString().slice(0, 10);
}
function isoDateToAgendaStart(value) {
    if (!value)
        return null;
    return `${String(value).slice(0, 10)}T08:00:00.000Z`;
}
function isoDateToAgendaEnd(value) {
    if (!value)
        return null;
    return `${String(value).slice(0, 10)}T18:00:00.000Z`;
}
async function createImportedDeadlineFollowUps(expediente, draft, userId_, userName_) {
    const baseDate = String(draft.fecha_inicio || draft.fecha_notificacion || '').slice(0, 10);
    if (!baseDate)
        return;
    const deadlineDate = addWorkingDaysFromIso(baseDate, 20);
    if (!deadlineDate)
        return;
    const reminderDate = subtractDaysFromIso(deadlineDate, 3) || deadlineDate;
    const expedienteLabel = draft.ref_expediente || draft.ref_propia || `${expediente.anio}/${expediente.num_exp}`;
    const descripcionBase = draft.descripcion || 'Expediente importado desde documento';
    const clienteId = draft.cliente_id || expediente.cliente_id || null;
    const clienteNombre = draft.cliente_nombre || expediente.cliente_nombre || null;
    const reminderTitle = `AVISO DE REVISIÓN · FECHA LÍMITE · ${expedienteLabel}`;
    const deadlineTitle = `FECHA LÍMITE · ${expedienteLabel}`;
    const reminderDescription = [
        'Seguimiento automático creado tras verificar el escaneo del expediente.',
        `Fecha límite del expediente: ${deadlineDate}`,
        `Fecha de revisión / aviso: ${reminderDate}`,
        descripcionBase,
    ].filter(Boolean).join('\n\n');
    if (clienteId) {
        const taskResult = await database_1.default.query(`INSERT INTO client_tasks
         (client_id, client_name, titulo, descripcion, plazo, fecha_aviso, estado, prioridad,
          expediente, expediente_id, tipo, juzgado, num_proc, notas, etapa, created_by, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`, [
            clienteId,
            clienteNombre,
            reminderTitle,
            reminderDescription,
            reminderDate,
            reminderDate,
            'pendiente',
            'alta',
            expedienteLabel,
            expediente.id,
            'plazo_procesal',
            draft.juzgado?.trim() || null,
            draft.num_autos?.trim() || null,
            draft.observaciones?.trim() || null,
            'Revisión documental',
            userName_,
            userId_,
        ]);
        const task = taskResult.rows[0];
        const reminderAgenda = await database_1.default.query(`INSERT INTO agenda_events
         (user_id, user_name, title, description, start_at, end_at, all_day, type, status,
          expediente_id, cliente_id, organization_context, source, task_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`, [
            userId_,
            userName_,
            reminderTitle,
            reminderDescription,
            isoDateToAgendaStart(reminderDate),
            isoDateToAgendaEnd(reminderDate),
            true,
            'plazo',
            'pendiente',
            expediente.id,
            clienteId,
            expedienteLabel,
            'document-import-review',
            task.id,
        ]);
        await database_1.default.query(`UPDATE client_tasks SET agenda_event_id = $1, updated_at = NOW() WHERE id = $2`, [reminderAgenda.rows[0]?.id || null, task.id]);
    }
    await database_1.default.query(`INSERT INTO agenda_events
       (user_id, user_name, title, description, start_at, end_at, all_day, type, status,
        expediente_id, cliente_id, organization_context, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
        userId_,
        userName_,
        deadlineTitle,
        `Vencimiento calculado automáticamente tras verificar el expediente.\n\n${descripcionBase}`,
        isoDateToAgendaStart(deadlineDate),
        isoDateToAgendaEnd(deadlineDate),
        true,
        'plazo',
        'pendiente',
        expediente.id,
        clienteId,
        expedienteLabel,
        'document-import-deadline',
    ]);
}
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath))
        fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
}
function sanitizeFileName(fileName) {
    return fileName.replace(/[^\w.\-]+/g, '_');
}
function getMimeType(ext) {
    switch (ext.toLowerCase()) {
        case '.pdf': return 'application/pdf';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.webp': return 'image/webp';
        case '.bmp': return 'image/bmp';
        case '.tif':
        case '.tiff': return 'image/tiff';
        case '.txt':
        case '.text': return 'text/plain';
        case '.rtf': return 'application/rtf';
        case '.doc': return 'application/msword';
        case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        default: return 'application/octet-stream';
    }
}
function explainImportFailure(error, fileName) {
    const developer = String(error?.message || error || 'Error desconocido');
    const lower = developer.toLowerCase();
    if (lower.includes('api key was reported as leaked') || lower.includes('clave gemini filtrada')) {
        return {
            userError: `No se pudo leer "${fileName}" con IA porque la clave de Gemini del servidor estÃ¡ bloqueada por seguridad.`,
            developerError: developer,
        };
    }
    if (lower.includes('quota exceeded') || lower.includes('too many requests') || lower.includes('sin cuota')) {
        return {
            userError: `No se pudo leer "${fileName}" con IA porque la cuota de Gemini del servidor estÃ¡ agotada.`,
            developerError: developer,
        };
    }
    if (lower.includes('gemini vision devolviÃ³ vacÃ­o') || lower.includes('gemini vision no devolviÃ³')) {
        return {
            userError: `No se pudo leer el contenido de "${fileName}" con la IA visual del servidor.`,
            developerError: developer,
        };
    }
    if (lower.includes('falta tesseract')) {
        return {
            userError: `No se pudo leer el contenido de "${fileName}" porque el documento necesita OCR y el servidor no tiene Tesseract instalado.`,
            developerError: developer,
        };
    }
    if (lower.includes('pdftoppm') || lower.includes('pdftocairo') || lower.includes('convertir el pdf a imagen')) {
        return {
            userError: `No se pudo leer el contenido de "${fileName}" porque el servidor no puede convertir el PDF escaneado a imagen para OCR.`,
            developerError: developer,
        };
    }
    if (lower.includes('ocr del pdf') || lower.includes('ocr se ejecutÃ³')) {
        return {
            userError: `No se pudo leer el contenido de "${fileName}" porque el PDF parece escaneado pero no se pudo obtener texto legible.`,
            developerError: developer,
        };
    }
    if (lower.includes('no se pudo extraer texto')) {
        return {
            userError: `No se pudo leer el contenido de "${fileName}". Comprueba que el documento sea legible o que no estÃ© corrupto.`,
            developerError: developer,
        };
    }
    if (lower.includes('gemini')) {
        return {
            userError: `No se pudo interpretar juridicamente "${fileName}". Revisa el documento o completa los datos a mano en la verificacion.`,
            developerError: developer,
        };
    }
    if (lower.includes('pdf') || lower.includes('ocr') || lower.includes('tesseract') || lower.includes('pdftotext')) {
        return {
            userError: `No se pudo extraer texto util de "${fileName}". Intenta con un PDF con texto o una imagen mas nÃ­tida.`,
            developerError: developer,
        };
    }
    return {
        userError: `No se pudo preparar "${fileName}" para crear el expediente.`,
        developerError: developer,
    };
}
function explainGeminiRuntimeError(error, stage, modelName) {
    const raw = String(error?.message || error || 'Error desconocido de Gemini');
    const lower = raw.toLowerCase();
    const prefix = stage === 'vision' ? `Gemini vision (${modelName})` : `Gemini texto (${modelName})`;
    if (lower.includes('api key was reported as leaked')) {
        return `${prefix}: clave Gemini filtrada o bloqueada por Google. ${raw}`;
    }
    if (lower.includes('quota exceeded') || lower.includes('too many requests')) {
        return `${prefix}: sin cuota disponible o lÃ­mite de peticiones alcanzado. ${raw}`;
    }
    if (lower.includes('404 not found') || lower.includes('is not found for api version')) {
        return `${prefix}: modelo no disponible para este endpoint. ${raw}`;
    }
    return `${prefix}: ${raw}`;
}
async function parseExpedienteFromText(text) {
    if (!text.trim())
        return { data: {}, error: null };
    if (!GEMINI_API_KEY || !genAI) {
        return { data: {}, error: 'Gemini texto: no hay GEMINI_API_KEY configurada en el backend.' };
    }
    const prompt = `Eres un asistente legal especializado en derecho espanol.
Analiza el documento y extrae SOLO los datos utiles para crear un expediente en un ERP juridico.

Tipos validos: ${VALID_TIPOS.join(', ')}
Estados validos: ${VALID_ESTADOS.join(', ')}

IMPORTANTE:
- demandantes: array JSON con TODOS los demandantes/parte actora (puede haber mas de uno y deben ir separados en elementos distintos)
- demandados: array JSON con TODOS los demandados/parte contraria (puede haber mas de uno y deben ir separados en elementos distintos)
- cliente_nombre: primer elemento de demandantes
- contrario: todos los demandados separados por " | "
- fecha_inicio: fecha de inicio del procedimiento (NO la fecha del documento) en YYYY-MM-DD
- fecha_notificacion: fecha en que se notifico al demandado en YYYY-MM-DD (cedula, diligencia, sello de recibido). Prioriza cualquier anotacion manuscrita que empiece por "Notificado" seguida de una fecha nn-nn-nn

Devuelve EXCLUSIVAMENTE JSON valido con esta forma:
{
  "tipo": null,
  "estado": null,
  "descripcion": null,
  "demandantes": [],
  "demandados": [],
  "cliente_nombre": null,
  "contrario": null,
  "procurador": null,
  "juzgado": null,
  "tipo_proc": null,
  "num_autos": null,
  "nig": null,
  "fecha_inicio": null,
  "fecha_notificacion": null,
  "ref_expediente": null,
  "tipos_asunto": null,
  "cuantia_principal": null,
  "observaciones": null
}

Texto del documento:
---
${text.slice(0, 12000)}
---`;
    let lastError = null;
    for (const modelName of GEMINI_MODELS) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const raw = result.response.text().trim()
                    .replace(/^```json?\s*/i, '')
                    .replace(/```\s*$/i, '')
                    .trim();
                return { data: sanitizeParsedExpediente(JSON.parse(raw)), error: null };
            }
            catch (error) {
                lastError = explainGeminiRuntimeError(error, 'text', modelName);
                console.warn(`[documentImport] ${lastError}`);
                if (attempt < 2 && isRetryableGeminiError(error)) {
                    await wait(1200 * (attempt + 1));
                    continue;
                }
                break;
            }
        }
    }
    return { data: {}, error: lastError || 'Gemini texto no pudo interpretar el documento.' };
}
function isAiUnavailableReason(reason) {
    const lower = String(reason || '').toLowerCase();
    return [
        'quota exceeded',
        'too many requests',
        'sin cuota',
        'no hay gemini_api_key',
        'no hay openai_api_key',
        'service unavailable',
        'high demand',
        'clave gemini',
        'openai vision',
        'openai texto',
        'gemini vision',
        'gemini texto',
        'bloqueada',
        'api no está activada',
        'service_disabled',
    ].some((token) => lower.includes(token));
}
async function parseExpedienteFromTextOpenAI(text) {
    if (!text.trim())
        return { data: {}, error: null };
    if (!openaiClient) {
        return { data: {}, error: 'OpenAI texto: no hay OPENAI_API_KEY configurada en el backend.' };
    }
    const prompt = `Eres un asistente legal especializado en derecho espanol.
Analiza el documento y extrae SOLO los datos utiles para crear un expediente en un ERP juridico.

Tipos validos: ${VALID_TIPOS.join(', ')}
Estados validos: ${VALID_ESTADOS.join(', ')}

Devuelve EXCLUSIVAMENTE JSON valido con esta forma:
{
  "tipo": null,
  "estado": null,
  "descripcion": null,
  "cliente_nombre": null,
  "contrario": null,
  "procurador": null,
  "juzgado": null,
  "tipo_proc": null,
  "num_autos": null,
  "nig": null,
  "fecha_inicio": null,
  "ref_expediente": null,
  "tipos_asunto": null,
  "cuantia_principal": null,
  "observaciones": null
}

Texto del documento:
---
${text.slice(0, 12000)}
---`;
    try {
        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 1200,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'Eres un asistente legal experto en expedientes judiciales espanoles.' },
                { role: 'user', content: prompt },
            ],
        });
        const raw = (response.choices[0]?.message?.content || '').trim();
        if (!raw)
            return { data: {}, error: 'OpenAI texto: no devolvio contenido para este documento.' };
        return { data: sanitizeParsedExpediente(JSON.parse(raw)), error: null };
    }
    catch (error) {
        return { data: {}, error: `OpenAI texto: ${String(error?.message || error || 'Error desconocido')}` };
    }
}
function sanitizeParsedExpediente(parsed) {
    const dateSource = [parsed.observaciones, parsed.transcription].filter(Boolean).join('\n');
    const prioritizedNotificadoDate = extractNotificadoDate(dateSource);
    const standaloneHandwrittenDate = extractStandaloneHandwrittenLikeDate(dateSource);
    const documentLevelFallbackDate = extractDocumentLevelNotificationDate(dateSource);
    const inferredTipoAsunto = inferTipoAsuntoFromContent(parsed.transcription, parsed.tipo_proc);
    const inferredDescripcion = inferDescripcionFromContent(parsed.transcription, parsed.tipo_proc, parsed.juzgado);
    if (parsed.tipo && !VALID_TIPOS.includes(parsed.tipo))
        parsed.tipo = 'otro';
    if (parsed.estado && !VALID_ESTADOS.includes(parsed.estado))
        parsed.estado = 'abierto';
    for (const arrKey of ['demandantes', 'demandados']) {
        if (parsed[arrKey] != null) {
            parsed[arrKey] = splitPartyNames(parsed[arrKey]);
        }
    }
    if (!parsed.cliente_nombre && Array.isArray(parsed.demandantes) && parsed.demandantes.length > 0) {
        parsed.cliente_nombre = parsed.demandantes[0];
    }
    if (!parsed.contrario && Array.isArray(parsed.demandados) && parsed.demandados.length > 0) {
        parsed.contrario = parsed.demandados.join(' | ');
    }
    if (prioritizedNotificadoDate) {
        parsed.fecha_notificacion = prioritizedNotificadoDate;
    }
    else if (standaloneHandwrittenDate) {
        parsed.fecha_notificacion = standaloneHandwrittenDate;
    }
    else if (!parsed.fecha_notificacion && documentLevelFallbackDate) {
        parsed.fecha_notificacion = documentLevelFallbackDate;
    }
    if (parsed.fecha_notificacion) {
        parsed.fecha_notificacion = normalizeLooseSpanishDate(parsed.fecha_notificacion) || (() => {
            const dn = new Date(parsed.fecha_notificacion);
            return Number.isNaN(dn.getTime()) ? null : dn.toISOString().slice(0, 10);
        })();
    }
    if ((!parsed.tipos_asunto || !String(parsed.tipos_asunto).trim()) && inferredTipoAsunto) {
        parsed.tipos_asunto = inferredTipoAsunto;
    }
    if ((!parsed.descripcion || !String(parsed.descripcion).trim() || /expediente importado desde documento/i.test(String(parsed.descripcion))) &&
        inferredDescripcion) {
        parsed.descripcion = inferredDescripcion;
    }
    if (parsed.descripcion)
        parsed.descripcion = String(parsed.descripcion).slice(0, 300);
    if (parsed.observaciones)
        parsed.observaciones = String(parsed.observaciones).slice(0, 1000);
    if (parsed.tipo_proc)
        parsed.tipo_proc = String(parsed.tipo_proc).slice(0, 120);
    if (parsed.tipos_asunto)
        parsed.tipos_asunto = String(parsed.tipos_asunto).slice(0, 120);
    if (parsed.transcription)
        parsed.transcription = String(parsed.transcription).slice(0, 12000);
    if (parsed.fecha_inicio) {
        const parsedDate = new Date(parsed.fecha_inicio);
        parsed.fecha_inicio = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString().slice(0, 10);
    }
    if (parsed.cuantia_principal != null) {
        const amount = parseFloat(String(parsed.cuantia_principal).replace(/[^\d.,-]/g, '').replace(',', '.'));
        parsed.cuantia_principal = Number.isNaN(amount) ? null : amount;
    }
    return parsed;
}
function mergeExtractedData(base, incoming) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(incoming || {})) {
        if (value !== null && value !== undefined && value !== '') {
            merged[key] = value;
        }
    }
    return sanitizeParsedExpediente(merged);
}
async function parseExpedienteFromVision(file, ocrText) {
    if (!GEMINI_API_KEY || !genAI) {
        return { data: {}, error: 'Gemini vision: no hay GEMINI_API_KEY configurada en el backend.' };
    }
    let imagesToCleanup = [];
    try {
        const imageInputs = file.ext === '.pdf'
            ? (0, docExtract_1.renderPdfPagesToImages)(file.fullPath, 8)
            : ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'].includes(file.ext)
                ? [{ path: file.fullPath, mimeType: getMimeType(file.ext), pageNumber: 1 }]
                : [];
        imagesToCleanup = file.ext === '.pdf' ? imageInputs : [];
        if (!imageInputs.length)
            return { data: {}, error: null };
        const ocrSection = ocrText.trim()
            ? 'OCR auxiliar (puede contener errores, usalo solo como referencia adicional):\n---\n' + ocrText.slice(0, 8000) + '\n---'
            : '';
        const prompt = [
            'Eres un experto en lectura de documentos judiciales espanoles, incluyendo documentos escaneados, fotocopiados y con texto manuscrito o anotaciones a mano.',
            'Analiza TODAS las paginas adjuntas con maxima atencion. Lee el texto impreso Y cualquier texto escrito a mano, sellos, anotaciones marginales, fechas y numeros manuscritos.',
            ocrSection,
            'Devuelve EXCLUSIVAMENTE JSON valido con esta forma:',
            '{"transcription":null,"tipo":null,"estado":null,"descripcion":null,"demandantes":[],"demandados":[],"cliente_nombre":null,"contrario":null,"procurador":null,"juzgado":null,"tipo_proc":null,"num_autos":null,"nig":null,"fecha_inicio":null,"fecha_notificacion":null,"ref_expediente":null,"tipos_asunto":null,"cuantia_principal":null,"observaciones":null}',
            'Reglas: transcription=transcribe TODO el texto visible impreso Y manuscrito (campo MAS IMPORTANTE, nunca null si hay texto); demandantes=array JSON con TODOS los demandantes/parte actora/clientes del despacho (puede ser mas de uno y deben ir separados en elementos distintos, nunca en un solo string); demandados=array JSON con TODOS los demandados/parte contraria (puede ser mas de uno y deben ir separados en elementos distintos); cliente_nombre=primer demandante (igual que demandantes[0]); contrario=todos los demandados unidos por " | "; descripcion=1-2 frases de que trata el documento; juzgado=nombre completo del juzgado; num_autos=numero de autos o procedimiento judicial; nig=NIG si aparece; fecha_inicio=fecha de inicio del procedimiento en YYYY-MM-DD (NO la fecha del documento); fecha_notificacion=fecha en que se notifico al demandado en YYYY-MM-DD y debe priorizar cualquier anotacion manuscrita que empiece por "Notificado" seguida de una fecha como nn-nn-nn; cuantia_principal=importe numerico sin simbolos de moneda; tipo en [judicial, extrajudicial, monitorio, obligacion_hacer, prejudicial, diligencias, penal, laboral, contencioso, otro]; observaciones=anotaciones manuscritas importantes u otros datos; usa null/[] si no es visible.',
        ].filter(Boolean).join('\n');
        const parts = [{ text: prompt }];
        for (const image of imageInputs) {
            parts.push({
                inlineData: {
                    mimeType: image.mimeType,
                    data: fs.readFileSync(image.path, { encoding: 'base64' }),
                },
            });
        }
        let lastError = null;
        for (const modelName of GEMINI_MODELS) {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const model = genAI.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent({
                        contents: [{ role: 'user', parts }],
                        generationConfig: {
                            temperature: 0.05,
                            topP: 0.8,
                            topK: 20,
                            responseMimeType: 'application/json',
                        },
                    });
                    const raw = result.response.text().trim()
                        .replace(/^```json?\s*/i, '')
                        .replace(/```\s*$/i, '')
                        .trim();
                    if (!raw) {
                        lastError = `Gemini vision (${modelName}) devolvi? vac?o para el documento renderizado.`;
                        continue;
                    }
                    return { data: sanitizeParsedExpediente(JSON.parse(raw)), error: null };
                }
                catch (error) {
                    lastError = explainGeminiRuntimeError(error, 'vision', modelName);
                    console.warn(`[documentImport] ${lastError}`);
                    if (attempt < 2 && isRetryableGeminiError(error)) {
                        await wait(1200 * (attempt + 1));
                        continue;
                    }
                    break;
                }
            }
        }
        return { data: {}, error: lastError || 'Gemini vision no pudo leer el documento.' };
    }
    finally {
        if (imagesToCleanup.length)
            (0, docExtract_1.cleanupRenderedPageImages)(imagesToCleanup);
    }
}
async function parseExpedienteFromVisionOpenAI(file, ocrText) {
    if (!openaiClient) {
        return { data: {}, error: 'OpenAI vision: no hay OPENAI_API_KEY configurada en el backend.' };
    }
    let imagesToCleanup = [];
    try {
        const imageInputs = file.ext === '.pdf'
            ? (0, docExtract_1.renderPdfPagesToImages)(file.fullPath, 8)
            : ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'].includes(file.ext)
                ? [{ path: file.fullPath, mimeType: getMimeType(file.ext), pageNumber: 1 }]
                : [];
        imagesToCleanup = file.ext === '.pdf' ? imageInputs : [];
        if (!imageInputs.length)
            return { data: {}, error: null };
        const imageMessages = imageInputs.map(img => ({
            type: 'image_url',
            image_url: {
                url: `data:${img.mimeType};base64,${fs.readFileSync(img.path, { encoding: 'base64' })}`,
                detail: 'high',
            },
        }));
        const systemPrompt = 'Eres un experto en lectura de documentos judiciales espanoles. Tu especialidad es leer documentos escaneados, fotocopiados, con texto impreso Y manuscrito, incluyendo sellos, anotaciones marginales y firmas con texto legible. Extraes datos estructurados en JSON con maxima precision.';
        const ocrSection = ocrText.trim() ? 'OCR auxiliar (puede tener errores, es solo referencia):\n---\n' + ocrText.slice(0, 6000) + '\n---' : '';
        const userPrompt = [
            'Analiza TODAS las paginas del documento "' + file.name + '" con maxima atencion.',
            'Lee el texto impreso Y cualquier texto manuscrito, sellos, anotaciones al margen, fechas escritas a mano y numeros manuscritos.',
            ocrSection,
            'Devuelve EXCLUSIVAMENTE JSON valido (sin markdown) con exactamente estos campos:',
            '{"transcription":null,"tipo":null,"estado":null,"descripcion":null,"demandantes":[],"demandados":[],"cliente_nombre":null,"contrario":null,"procurador":null,"juzgado":null,"tipo_proc":null,"num_autos":null,"nig":null,"fecha_inicio":null,"fecha_notificacion":null,"ref_expediente":null,"tipos_asunto":null,"cuantia_principal":null,"observaciones":null}',
            'Reglas: transcription=transcribe TODO el texto visible impreso Y manuscrito (campo MAS IMPORTANTE, nunca null si hay texto en alguna pagina); demandantes=array JSON con TODOS los nombres de demandantes/parte actora (uno o varios, siempre separados en elementos distintos); demandados=array JSON con TODOS los nombres de demandados/parte contraria (uno o varios, muy comun que haya mas de uno, siempre separados en elementos distintos); cliente_nombre=primer elemento de demandantes; contrario=todos los demandados unidos por " | "; descripcion=1-2 frases que resumen el documento; juzgado=nombre completo del juzgado; num_autos=numero de autos o procedimiento judicial; nig=Numero de Identificacion General si aparece; fecha_inicio=fecha de inicio del procedimiento en YYYY-MM-DD (NO la fecha del documento); fecha_notificacion=fecha en que se notifico/cedulo al demandado en YYYY-MM-DD y debe priorizar cualquier anotacion manuscrita que empiece por "Notificado" seguida de fecha nn-nn-nn; cuantia_principal=importe numerico reclamado sin simbolos de moneda; tipo en [judicial, extrajudicial, monitorio, obligacion_hacer, prejudicial, diligencias, penal, laboral, contencioso, otro]; observaciones=anotaciones manuscritas importantes, datos relevantes no clasificados en otros campos; usa null o [] si no es visible en ninguna pagina.',
        ].filter(Boolean).join('\n');
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await openaiClient.chat.completions.create({
                    model: 'gpt-4o',
                    max_tokens: 4000,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: [{ type: 'text', text: userPrompt }, ...imageMessages] },
                    ],
                });
                const raw = (response.choices[0]?.message?.content || '').trim();
                if (!raw) {
                    if (attempt < 2) {
                        await wait(1500);
                        continue;
                    }
                    break;
                }
                return { data: sanitizeParsedExpediente(JSON.parse(raw)), error: null };
            }
            catch (error) {
                const msg = String(error?.message || error || '');
                console.warn(`[documentImport] OpenAI vision attempt ${attempt + 1} failed:`, msg);
                if (attempt < 2 && (msg.includes('429') || msg.includes('rate') || msg.includes('overload'))) {
                    await wait(2000 * (attempt + 1));
                    continue;
                }
                return { data: {}, error: `GPT-4o vision: ${msg}` };
            }
        }
        return { data: {}, error: 'GPT-4o vision: no devolvio respuesta tras 3 intentos.' };
    }
    finally {
        if (imagesToCleanup.length)
            (0, docExtract_1.cleanupRenderedPageImages)(imagesToCleanup);
    }
}
async function parseExpedienteFromBestVision(file, ocrText) {
    let openAiResult = null;
    let geminiResult = null;
    if (openaiClient) {
        openAiResult = await parseExpedienteFromVisionOpenAI(file, ocrText);
    }
    if (genAI && GEMINI_API_KEY) {
        geminiResult = await parseExpedienteFromVision(file, ocrText);
    }
    if (openAiResult && geminiResult) {
        return {
            data: mergeExtractedData(openAiResult.data, geminiResult.data),
            error: [openAiResult.error, geminiResult.error].filter(Boolean).join(' | ') || null,
        };
    }
    if (geminiResult)
        return geminiResult;
    if (openAiResult)
        return openAiResult;
    return { data: {}, error: 'No hay proveedor de vision configurado en el backend.' };
}
async function parseExpedienteFromBestText(text) {
    if (!text.trim())
        return { data: {}, error: null };
    if (openaiClient) {
        const openAiResult = await parseExpedienteFromTextOpenAI(text);
        if (hasMeaningfulExtractedData(openAiResult.data))
            return openAiResult;
        if (!genAI || !GEMINI_API_KEY)
            return openAiResult;
        const geminiResult = await parseExpedienteFromText(text);
        return {
            data: mergeExtractedData(openAiResult.data, geminiResult.data),
            error: [openAiResult.error, geminiResult.error].filter(Boolean).join(' | ') || null,
        };
    }
    return parseExpedienteFromText(text);
}
function buildDraftFromExtracted(extractedData, clienteId, procuradorOverride) {
    const prioritizedReceivedDate = extractedData.fecha_notificacion || extractedData.fecha_inicio || new Date().toISOString().slice(0, 10);
    return {
        anio: new Date().getFullYear(),
        ref_propia: '',
        ref_expediente: extractedData.ref_expediente || '',
        descripcion: extractedData.descripcion || 'Expediente importado desde documento',
        tipo: extractedData.tipo || 'judicial',
        cliente_id: clienteId || '',
        cliente_nombre: extractedData.cliente_nombre || '',
        contrario: extractedData.contrario || '',
        procurador: procuradorOverride || extractedData.procurador || '',
        juzgado: extractedData.juzgado || '',
        tipo_proc: extractedData.tipo_proc || '',
        num_autos: extractedData.num_autos || '',
        nig: extractedData.nig || '',
        estado: extractedData.estado || 'abierto',
        observaciones: extractedData.observaciones || '',
        fecha_inicio: prioritizedReceivedDate,
        fecha_notificacion: extractedData.fecha_notificacion || null,
        demandantes: extractedData.demandantes || null,
        demandados: extractedData.demandados || null,
        fecha_cierre: '',
        importe: '',
        tipos_asunto: extractedData.tipos_asunto || '',
        cuantia_principal: extractedData.cuantia_principal ?? '',
        intereses: '',
        costas: '',
        cuantia_total: '',
        indeterminado: false,
        etapa: '',
        persona_contacto: '',
        contacto: '',
        centro: '',
        color: 'ninguno',
    };
}
async function createExpediente(data, userName_) {
    const yr = data.anio || new Date().getFullYear();
    const { rows: maxR } = await database_1.default.query(`SELECT COALESCE(MAX(num_exp), 0) + 1 AS next FROM expedientes WHERE anio = $1`, [yr]);
    const numExp = maxR[0].next;
    let clienteNombre = data.cliente_nombre || null;
    if (data.cliente_id && !clienteNombre) {
        const cr = await database_1.default.query(`SELECT first_name || COALESCE(' ' || last_name, '') AS n FROM entities WHERE id = $1`, [data.cliente_id]);
        clienteNombre = cr.rows[0]?.n || null;
    }
    const { rows } = await database_1.default.query(`INSERT INTO expedientes
       (anio, num_exp, ref_propia, ref_expediente, descripcion, tipo,
        cliente_id, cliente_nombre, contrario, procurador, juzgado,
        tipo_proc, num_autos, nig, estado, observaciones,
        fecha_inicio, fecha_cierre, importe,
        tipos_asunto, cuantia_principal, intereses, costas, cuantia_total,
        indeterminado, etapa, persona_contacto, contacto, centro, color,
        demandantes, demandados, fecha_notificacion,
        created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
     RETURNING id, anio, num_exp`, [
        yr, numExp,
        data.ref_propia?.trim() || null,
        data.ref_expediente?.trim() || null,
        data.descripcion?.trim() || 'Expediente importado desde documento',
        data.tipo || 'judicial',
        data.cliente_id || null,
        clienteNombre,
        data.contrario?.trim() || null,
        data.procurador?.trim() || null,
        data.juzgado?.trim() || null,
        data.tipo_proc?.trim() || null,
        data.num_autos?.trim() || null,
        data.nig?.trim() || null,
        data.estado || 'abierto',
        data.observaciones?.trim() || null,
        data.fecha_inicio || null,
        data.fecha_cierre || null,
        data.importe || null,
        data.tipos_asunto?.trim() || null,
        data.cuantia_principal !== '' && data.cuantia_principal != null ? data.cuantia_principal : null,
        data.intereses !== '' && data.intereses != null ? data.intereses : null,
        data.costas !== '' && data.costas != null ? data.costas : null,
        data.cuantia_total !== '' && data.cuantia_total != null ? data.cuantia_total : null,
        data.indeterminado === true || data.indeterminado === 'true',
        data.etapa?.trim() || null,
        data.persona_contacto?.trim() || null,
        data.contacto?.trim() || null,
        data.centro?.trim() || null,
        data.color?.trim() || 'ninguno',
        data.demandantes ? JSON.stringify(data.demandantes) : null,
        data.demandados ? JSON.stringify(data.demandados) : null,
        data.fecha_notificacion || null,
        userName_,
    ]);
    return rows[0];
}
function persistDocumentForReview(batchId, rowNumber, file) {
    const folder = ensureDir(path.join(paths_1.UPLOADS_ROOT, 'document-imports', batchId));
    const storedName = `${String(rowNumber).padStart(3, '0')}_${sanitizeFileName(file.name)}`;
    const destination = path.join(folder, storedName);
    fs.copyFileSync(file.fullPath, destination);
    return {
        storedName,
        previewUrl: `/uploads/document-imports/${batchId}/${storedName}`,
        mimeType: getMimeType(file.ext),
    };
}
async function attachImportedDocumentToExpediente(expedienteId, payload, userId_) {
    const previewStoredName = String(payload?.storedName || '').trim();
    const originalName = String(payload?.fileName || payload?.reference || '').trim();
    const mimeType = String(payload?.mimeType || 'application/octet-stream').trim();
    const documentName = path.parse(originalName || previewStoredName || 'Documento importado').name;
    if (!previewStoredName || !originalName)
        return;
    const sourcePath = path.join(paths_1.UPLOADS_ROOT, 'document-imports', String(payload?.batchId || ''), previewStoredName);
    if (!fs.existsSync(sourcePath))
        return;
    const expedienteDir = ensureDir(path.join(paths_1.UPLOADS_CLIENTS_ROOT, expedienteId));
    const storedName = `${Date.now()}_${sanitizeFileName(originalName)}`;
    const destinationPath = path.join(expedienteDir, storedName);
    fs.copyFileSync(sourcePath, destinationPath);
    const stat = fs.statSync(destinationPath);
    await database_1.default.query(`INSERT INTO client_files
       (client_id, original_name, stored_name, mimetype, size_bytes, document_name, attachment_type, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
        expedienteId,
        originalName,
        storedName,
        mimeType,
        stat.size,
        documentName || null,
        'Sin clasificar',
        userId_,
    ]);
}
async function refreshBatchCounters(batchId) {
    const { rows } = await database_1.default.query(`SELECT
        COUNT(*) FILTER (WHERE status='completed') AS completed_count,
        COUNT(*) FILTER (WHERE status='failed') AS error_count,
        COUNT(*) FILTER (WHERE status='uploaded') AS pending_count,
        COUNT(*) AS total_count
     FROM expediente_import_items
     WHERE batch_id=$1`, [batchId]);
    const counts = rows[0] || {};
    const completedCount = Number(counts.completed_count || 0);
    const errorCount = Number(counts.error_count || 0);
    const pendingCount = Number(counts.pending_count || 0);
    const totalCount = Number(counts.total_count || 0);
    const status = pendingCount > 0
        ? 'reviewing'
        : completedCount > 0
            ? 'completed'
            : 'failed';
    await database_1.default.query(`UPDATE expediente_import_batches
     SET total_count=$1, completed_count=$2, error_count=$3, pending_count=$4, status=$5
     WHERE id=$6`, [totalCount, completedCount, errorCount, pendingCount, status, batchId]);
    return { totalCount, completedCount, errorCount, pendingCount, status };
}
async function uploadDocumentImport(req, res) {
    const uid = userId(req);
    const unam = userName(req);
    if (!uid)
        return err(res, 'No autenticado', 401);
    const zipFile = req.file;
    if (!zipFile)
        return err(res, 'No se recibiÃ³ ningÃºn archivo ZIP', 400);
    const clienteId = req.body.cliente_id || null;
    const procuradorForzado = req.body.procurador || null;
    const autoAssign = req.body.auto_assign === 'true';
    let batchId = '';
    let zipDir = '';
    try {
        const batchResult = await database_1.default.query(`INSERT INTO expediente_import_batches
         (user_id, user_name, file_name, status, total_count, notes)
       VALUES ($1,$2,$3,'processing',0,$4)
       RETURNING id`, [uid, unam, zipFile.originalname, 'ImportaciÃ³n desde documentos ZIP']);
        batchId = batchResult.rows[0].id;
        const { dir, files } = (0, docExtract_1.extractZip)(zipFile.path);
        zipDir = dir;
        if (files.length === 0) {
            await database_1.default.query(`UPDATE expediente_import_batches SET status='failed', notes=$1 WHERE id=$2`, ['El ZIP no contiene documentos en formato soportado (PDF, DOCX, TXT, imÃ¡genes)', batchId]);
            return err(res, 'El ZIP no contiene documentos soportados', 400);
        }
        await database_1.default.query(`UPDATE expediente_import_batches SET total_count=$1, pending_count=$1 WHERE id=$2`, [files.length, batchId]);
        let reviewCount = 0;
        let errorCount = 0;
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            let status = 'uploaded';
            let userError = null;
            let developerError = null;
            let extractedData = {};
            let draft = buildDraftFromExtracted({}, autoAssign ? clienteId : null, autoAssign ? procuradorForzado : null);
            let textPreview = '';
            let extractionWarning = null;
            let textStageError = null;
            let visionStageError = null;
            try {
                try {
                    textPreview = (0, docExtract_1.extractTextFromFile)(file).trim();
                }
                catch (extractError) {
                    extractionWarning = String(extractError?.message || extractError || 'La extracciÃ³n clÃ¡sica fallÃ³');
                    console.warn(`[documentImport] ExtracciÃ³n clÃ¡sica con incidencia en ${file.name}:`, extractionWarning);
                    textPreview = '';
                }
                const visionFirst = file.ext === '.pdf' || ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp'].includes(file.ext);
                const extractedFromVision = visionFirst
                    ? await parseExpedienteFromBestVision(file, textPreview)
                    : { data: {}, error: null };
                const shouldRunTextStage = Boolean(textPreview);
                const extractedFromText = shouldRunTextStage
                    ? await parseExpedienteFromBestText(textPreview)
                    : { data: {}, error: null };
                visionStageError = extractedFromVision.error;
                textStageError = extractedFromText.error;
                extractedData = visionFirst
                    ? mergeExtractedData(extractedFromText.data, extractedFromVision.data)
                    : mergeExtractedData(extractedFromVision.data, extractedFromText.data);
                if (!extractedData.fecha_notificacion) {
                    const focusedNotificationDate = await extractFocusedNotificationDate(file);
                    if (focusedNotificationDate) {
                        extractedData.fecha_notificacion = focusedNotificationDate;
                    }
                }
                const combinedText = [textPreview, extractedFromVision.data.transcription || '']
                    .filter((value) => String(value || '').trim())
                    .join('\n\n');
                textPreview = combinedText.trim().slice(0, 12000);
                if (!textPreview && !Object.keys(extractedData).some((key) => key !== 'transcription' && extractedData[key])) {
                    const reasons = [visionStageError, textStageError, extractionWarning].filter(Boolean).join(' | ');
                    if (isAiUnavailableReason(reasons)) {
                        status = 'failed';
                        userError = `El escaneo de "${file.name}" no salió bien porque la IA documental no está disponible ahora mismo. Inténtalo de nuevo más tarde.`;
                    }
                    else {
                        userError = `No se pudo leer automáticamente "${file.name}". Revisa el documento y completa los datos a mano.`;
                    }
                    developerError = reasons || userError;
                    console.warn(`[documentImport] Sin datos extraíbles en ${file.name}:`, developerError);
                }
                draft = buildDraftFromExtracted(extractedData, autoAssign ? clienteId : null, autoAssign ? procuradorForzado : null);
                reviewCount++;
            }
            catch (error) {
                status = 'failed';
                const explained = explainImportFailure(error, file.name);
                userError = explained.userError;
                developerError = explained.developerError;
                errorCount++;
                console.error(`[documentImport] Error procesando ${file.name}:`, developerError);
            }
            const preview = persistDocumentForReview(batchId, index + 1, file);
            await database_1.default.query(`INSERT INTO expediente_import_items
           (batch_id, row_number, reference, status, error_message, payload, created_expediente_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
                batchId,
                index + 1,
                file.name,
                status,
                userError,
                JSON.stringify({
                    batchId,
                    fileName: file.name,
                    mimeType: preview.mimeType,
                    previewUrl: preview.previewUrl,
                    storedName: preview.storedName,
                    extractedData,
                    draft,
                    textPreview: textPreview.slice(0, 12000),
                    userError,
                    developerError,
                }),
                null,
            ]);
        }
        const counters = await refreshBatchCounters(batchId);
        await database_1.default.query(`UPDATE expediente_import_batches SET notes=$1 WHERE id=$2`, [`${reviewCount} documentos listos para revisiÃ³n y ${errorCount} con incidencias.`, batchId]);
        return ok(res, {
            batchId,
            totalCount: counters.totalCount,
            reviewCount,
            errorCount,
            status: counters.status,
        });
    }
    catch (error) {
        if (batchId) {
            await database_1.default.query(`UPDATE expediente_import_batches SET status='failed', notes=$1 WHERE id=$2`, [error.message, batchId]);
        }
        return err(res, `Error procesando ZIP: ${error.message}`);
    }
    finally {
        if (zipDir)
            (0, docExtract_1.cleanupDir)(zipDir);
        try {
            if (zipFile?.path)
                fs.unlinkSync(zipFile.path);
        }
        catch { }
    }
}
async function acceptDocumentImportItem(req, res) {
    const uid = userId(req);
    const unam = userName(req);
    if (!uid)
        return err(res, 'No autenticado', 401);
    const { batchId, itemId } = req.params;
    const verifiedDraft = req.body?.draft || null;
    try {
        const { rows: batchRows } = await database_1.default.query(`SELECT * FROM expediente_import_batches WHERE id=$1 AND user_id=$2`, [batchId, uid]);
        if (!batchRows.length)
            return err(res, 'Lote no encontrado', 404);
        const { rows: itemRows } = await database_1.default.query(`SELECT * FROM expediente_import_items WHERE id=$1 AND batch_id=$2`, [itemId, batchId]);
        if (!itemRows.length)
            return err(res, 'Documento no encontrado', 404);
        const item = itemRows[0];
        if (item.created_expediente_id) {
            return err(res, 'Este documento ya fue aceptado y creÃ³ un expediente', 409);
        }
        const payload = item.payload || {};
        const draft = verifiedDraft || payload.draft || {};
        if (!draft.descripcion || !String(draft.descripcion).trim()) {
            return err(res, 'AÃ±ade una descripciÃ³n antes de aceptar el expediente', 400);
        }
        if (!draft.cliente_id && !String(draft.cliente_nombre || '').trim()) {
            return err(res, 'Indica un cliente escribiendo el nombre o seleccionando uno existente antes de aceptar el expediente', 400);
        }
        const representacion = String(req.body?.representa_a || draft.representa_a || 'demandantes');
        const demandantes = Array.isArray(draft.demandantes) ? draft.demandantes : [];
        const demandados = Array.isArray(draft.demandados) ? draft.demandados : [];
        const finalDraft = {
            ...draft,
            cliente_nombre: draft.cliente_nombre || demandantes[0] || '',
            contrario: draft.contrario || demandados.join(' | '),
            representa_a: representacion,
        };
        const expediente = await createExpediente(finalDraft, unam);
        await attachImportedDocumentToExpediente(expediente.id, payload, uid);
        await createImportedDeadlineFollowUps(expediente, finalDraft, uid, unam);
        await database_1.default.query(`UPDATE expediente_import_items
       SET status='completed',
           error_message=NULL,
           created_expediente_id=$1,
           payload=$2
       WHERE id=$3`, [
            expediente.id,
            JSON.stringify({
                ...payload,
                draft: finalDraft,
                userError: null,
                developerError: null,
                acceptedAt: new Date().toISOString(),
            }),
            itemId,
        ]);
        const counters = await refreshBatchCounters(batchId);
        return ok(res, { expediente, counters });
    }
    catch (error) {
        return err(res, error.message || 'No se pudo aceptar el documento');
    }
}
async function getDocumentImportBatch(req, res) {
    const uid = userId(req);
    if (!uid)
        return err(res, 'No autenticado', 401);
    const { id } = req.params;
    try {
        const { rows: batch } = await database_1.default.query(`SELECT * FROM expediente_import_batches WHERE id=$1 AND user_id=$2`, [id, uid]);
        if (!batch.length)
            return err(res, 'Batch no encontrado', 404);
        const { rows: items } = await database_1.default.query(`SELECT i.*, e.anio, e.num_exp, e.descripcion, e.tipo, e.cliente_nombre
       FROM expediente_import_items i
       LEFT JOIN expedientes e ON e.id = i.created_expediente_id
       WHERE i.batch_id=$1
       ORDER BY i.row_number`, [id]);
        return ok(res, { batch: batch[0], items });
    }
    catch (error) {
        return err(res, error.message);
    }
}
async function listDocumentImportBatches(req, res) {
    const uid = userId(req);
    if (!uid)
        return err(res, 'No autenticado', 401);
    try {
        const { rows } = await database_1.default.query(`SELECT * FROM expediente_import_batches
       WHERE user_id=$1 AND notes IS NOT NULL
       ORDER BY created_at DESC LIMIT 20`, [uid]);
        return ok(res, rows);
    }
    catch (error) {
        return err(res, error.message);
    }
}
