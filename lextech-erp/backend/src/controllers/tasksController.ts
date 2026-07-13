import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/database';
import { TEMP_ROOT, UPLOADS_CLIENTS_ROOT as CLIENT_UPLOADS_ROOT } from '../config/paths';
import { logActivity, logActivityForReq, resolveUserName } from './activityController';

const LIBREOFFICE_ENABLED =
  String(process.env.ENABLE_LIBREOFFICE_PREVIEW || "true").trim().toLowerCase() !== "false";

const OFFICE_TEMP_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export const TASK_FILES_ROOT = path.join(CLIENT_UPLOADS_ROOT, '..', 'task-files');

const ensureTaskFilesDir = (taskId: string) => {
  const dir = path.join(TASK_FILES_ROOT, taskId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const _taskTempTokens = new Map<string, { taskId: string; fileId: string; exp: number }>();
const _taskCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, data] of _taskTempTokens) {
    if (data.exp < now) _taskTempTokens.delete(token);
  }
}, 60_000);
if (typeof (_taskCleanupTimer as any).unref === 'function') (_taskCleanupTimer as any).unref();

const isOfficeOpenable = (fileName?: string | null, mimeType?: string | null) => {
  const ext = path.extname(fileName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  return [
    '.doc', '.docx', '.odt', '.rtf', '.dot', '.dotx',
    '.xls', '.xlsx', '.xlsm', '.xlsb', '.ods', '.csv',
    '.ppt', '.pptx', '.odp',
  ].includes(ext)
    || mime.includes('word')
    || mime.includes('excel')
    || mime.includes('spreadsheet')
    || mime.includes('presentation');
};

const getTaskFileRecord = async (taskId: string, fileId: string) => {
  const result = await pool.query(
    `SELECT stored_name, original_name, mimetype
     FROM task_files
     WHERE id = $1 AND task_id = $2`,
    [fileId, taskId]
  );
  return result.rows[0] || null;
};

const explainTaskError = (error: any) => {
  const raw = String(error?.message || "");

  if (
    raw.includes("invalid input syntax for type timestamp with time zone") ||
    raw.includes("invalid input syntax for type timestamp") ||
    raw.includes("invalid input syntax for type date")
  ) {
    return "No se pudo guardar la tarea porque una fecha u hora tiene un formato inválido. Revisa el plazo, el recordatorio o la fecha vinculada del calendario.";
  }

  if (raw.includes("violates foreign key constraint")) {
    return "No se pudo guardar la tarea porque falta o no existe el cliente o expediente vinculado.";
  }

  if (raw.includes("null value in column")) {
    return "No se pudo guardar la tarea porque falta un dato obligatorio.";
  }

  return "No se pudo guardar la tarea por un error interno. Revisa los datos y vuelve a intentarlo.";
};

// client_tasks.plazo/fecha_aviso son columnas DATE: pg las devuelve como objetos
// Date (no strings), y String(new Date(...)) da un formato tipo "Mon Jul 20 2026 ..."
// que no es una fecha ISO válida. Hay que extraer año-mes-día explícitamente.
// OJO: pg-types construye ese Date con el constructor LOCAL (new Date(y, m, d)),
// así que hay que leerlo con getters locales (no toISOString, que es UTC y
// desplazaría la fecha un día si el servidor corre en una zona horaria positiva).
const normalizeTaskDate = (value?: string | Date | null): string | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
};

const taskDateToAgendaStart = (value?: string | Date | null) => {
  const d = normalizeTaskDate(value);
  return d ? `${d}T08:00:00.000Z` : null;
};

const taskDateToAgendaEnd = (value?: string | Date | null) => {
  const d = normalizeTaskDate(value);
  return d ? `${d}T18:00:00.000Z` : null;
};

const mapTaskEstadoToAgendaStatus = (estado?: string | null) =>
  estado === 'completada' ? 'completado' : 'pendiente';

const mapTaskTipoToAgendaType = (tipo?: string | null) => {
  if (!tipo) return 'plazo';
  if (['reunion'].includes(tipo)) return 'reunion';
  if (['vista_juicio'].includes(tipo)) return 'vista';
  return 'plazo';
};

const buildTaskAgendaPayload = (task: any) => {
  const eventDate = task.fecha_aviso || task.plazo;
  if (!eventDate) return null;

  const descriptionParts = [task.descripcion, task.notas].filter(Boolean);
  return {
    title: task.titulo,
    description: descriptionParts.join('\n\n') || null,
    start_at: taskDateToAgendaStart(eventDate),
    end_at: taskDateToAgendaEnd(eventDate),
    all_day: true,
    type: mapTaskTipoToAgendaType(task.tipo),
    status: mapTaskEstadoToAgendaStatus(task.estado),
    expediente_id: task.expediente_id || null,
    cliente_id: task.client_id || null,
    organization_context: task.expediente || null,
    source: 'task-sync',
    task_id: task.id,
  };
};

// ── GET /api/tasks/client/:clientId ────────────────────────────
export const getTasks = async (req: any, res: Response) => {
  const { clientId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM client_tasks WHERE client_id = $1 ORDER BY
        CASE estado WHEN 'urgente' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END,
        plazo ASC NULLS LAST,
        created_at DESC`,
      [clientId]
    );
    res.json({ data: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: explainTaskError(e) });
  }
};

// ── GET /api/tasks/me ── tareas del usuario autenticado ────────
export const getMyTasks = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const result = await pool.query(
      `SELECT ct.*,
              COALESCE(e.commercial_name, e.first_name || ' ' || COALESCE(e.last_name,'')) AS client_name_resolved
       FROM client_tasks ct
       LEFT JOIN entities e ON e.id = ct.client_id
       WHERE ct.user_id = $1
       ORDER BY
         CASE ct.estado WHEN 'urgente' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END,
         ct.plazo ASC NULLS LAST,
         ct.created_at DESC`,
      [userId]
    );
    res.json({ data: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: explainTaskError(e) });
  }
};

// ── POST /api/tasks/client/:clientId ───────────────────────────
export const createTask = async (req: any, res: Response) => {
  const { clientId } = req.params;
  const { titulo, descripcion, plazo, fecha_aviso, estado, prioridad, expediente, expediente_id, tipo, juzgado, num_proc, importe, notas, etapa } = req.body;

  if (!titulo?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });

  const userId   = req.auth?.userId || 'SYSTEM';
  const userName = await resolveUserName(userId);

  try {
    // Obtener nombre del cliente para guardarlo en la tarea
    const clientRow = await pool.query(
      `SELECT COALESCE(commercial_name, first_name || ' ' || COALESCE(last_name,'')) AS name FROM entities WHERE id = $1`,
      [clientId]
    );
    const clientName = clientRow.rows[0]?.name || null;

    const result = await pool.query(
      `INSERT INTO client_tasks
         (client_id, client_name, titulo, descripcion, plazo, fecha_aviso, estado, prioridad,
          expediente, expediente_id, tipo, juzgado, num_proc, importe, notas, etapa, created_by, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        clientId, clientName,
        titulo.trim(),
        descripcion?.trim() || null,
        plazo || null,
        fecha_aviso || null,
        estado || 'pendiente',
        prioridad || 'media',
        expediente?.trim() || null,
        expediente_id || null,
        tipo || 'otro',
        juzgado?.trim() || null,
        num_proc?.trim() || null,
        importe ? parseFloat(importe) : null,
        notas?.trim() || null,
        etapa?.trim() || null,
        userName,
        userId,
      ]
    );
    const createdTask = result.rows[0];
    const agendaPayload = buildTaskAgendaPayload(createdTask);

    // La sincronización con la Agenda es un extra sobre la tarea ya guardada:
    // si falla, no debe hacer parecer que la tarea (que sí se creó arriba) falló.
    if (agendaPayload) {
      try {
        const agendaRes = await pool.query(
          `INSERT INTO agenda_events
             (user_id, user_name, title, description, start_at, end_at, all_day,
              type, status, expediente_id, cliente_id, organization_context, source, task_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *`,
          [
            userId,
            userName,
            agendaPayload.title,
            agendaPayload.description,
            agendaPayload.start_at,
            agendaPayload.end_at,
            agendaPayload.all_day,
            agendaPayload.type,
            agendaPayload.status,
            agendaPayload.expediente_id,
            agendaPayload.cliente_id,
            agendaPayload.organization_context,
            agendaPayload.source,
            agendaPayload.task_id,
          ]
        );

        const linkedAgenda = agendaRes.rows[0];
        await pool.query(
          `UPDATE client_tasks SET agenda_event_id = $1, updated_at = NOW() WHERE id = $2`,
          [linkedAgenda.id, createdTask.id]
        );
        createdTask.agenda_event_id = linkedAgenda.id;
      } catch (agendaErr: any) {
        console.error('No se pudo sincronizar la tarea con la Agenda:', agendaErr?.message || agendaErr);
      }
    }

    logActivityForReq(req, `Tarea creada: ${titulo.trim()}`, 'CLIENT', clientId);
    res.status(201).json({ data: createdTask });
  } catch (e: any) {
    res.status(500).json({ error: explainTaskError(e) });
  }
};

// ── PUT /api/tasks/:id ─────────────────────────────────────────
export const listTaskFiles = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, task_id, original_name, stored_name, mimetype, size_bytes,
              document_name, attachment_type, created_by, created_at, updated_at
       FROM task_files
       WHERE task_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    const rows = result.rows.map((row: any) => {
      if (!isOfficeOpenable(row.original_name, row.mimetype)) return row;
      const token = crypto.randomUUID();
      _taskTempTokens.set(token, { taskId: id, fileId: row.id, exp: Date.now() + OFFICE_TEMP_TOKEN_TTL_MS });
      return { ...row, open_token: token };
    });
    ensureTaskFilesDir(id);
    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const uploadTaskFiles = async (req: any, res: Response) => {
  const { id } = req.params;
  const userId = req.auth?.userId || 'SYSTEM';
  const files: Express.Multer.File[] = req.files as Express.Multer.File[];

  if (!files?.length) {
    return res.status(400).json({ success: false, error: 'No se recibieron archivos.' });
  }

  try {
    const inserted: any[] = [];
    for (const file of files) {
      const baseFileName = path.basename(file.originalname);
      const result = await pool.query(
        `INSERT INTO task_files
           (task_id, original_name, stored_name, mimetype, size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, baseFileName, file.filename, file.mimetype, file.size, userId]
      );
      inserted.push(result.rows[0]);
    }

    await logActivityForReq(req, `Adjuntos añadidos a actuación`, 'TASK', id);
    res.status(201).json({ success: true, data: inserted });
  } catch (e: any) {
    res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const updateTaskFileMetadata = async (req: any, res: Response) => {
  const { id, fileId } = req.params;
  const { document_name, attachment_type } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE task_files
       SET document_name = $1,
           attachment_type = $2,
           updated_at = NOW()
       WHERE id = $3 AND task_id = $4
       RETURNING *`,
      [
        document_name?.trim() || null,
        attachment_type?.trim() || 'Sin clasificar',
        fileId,
        id,
      ]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const downloadTaskFile = async (req: any, res: Response) => {
  const { id, fileId } = req.params;
  try {
    const fileRow = await getTaskFileRecord(id, fileId);
    if (!fileRow) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }

    const { stored_name, original_name, mimetype } = fileRow;
    const filePath = path.join(TASK_FILES_ROOT, id, stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    res.setHeader('Content-Type', mimetype || 'application/octet-stream');
    const asciiName = original_name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(original_name)}`
    );
    res.sendFile(filePath);
  } catch (e: any) {
    res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const createTaskFileTempToken = async (req: any, res: Response) => {
  const { id, fileId } = req.params;
  try {
    const fileRow = await getTaskFileRecord(id, fileId);
    if (!fileRow) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const token = crypto.randomUUID();
    _taskTempTokens.set(token, { taskId: id, fileId, exp: Date.now() + OFFICE_TEMP_TOKEN_TTL_MS });
    res.json({ success: true, token });
  } catch (e: any) {
    res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const downloadTaskFileByToken = async (req: any, res: Response) => {
  const { token } = req.params;
  const data = _taskTempTokens.get(token);
  if (!data || data.exp < Date.now()) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
  }
  const isHead = req.method === 'HEAD';
  try {
    const fileRow = await getTaskFileRecord(data.taskId, data.fileId);
    if (!fileRow) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }

    const { stored_name, original_name, mimetype } = fileRow;
    const filePath = path.join(TASK_FILES_ROOT, data.taskId, stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    res.setHeader('Content-Type', mimetype || 'application/octet-stream');
    const asciiName = original_name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(original_name)}`
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (isHead) return res.status(200).end();
    res.sendFile(filePath);
  } catch (e: any) {
    res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const syncTaskFileByToken = async (req: any, res: Response) => {
  const { token } = req.params;
  const data = _taskTempTokens.get(token);
  if (!data || data.exp < Date.now()) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
  }

  try {
    const fileRow = await pool.query(
      `SELECT stored_name, original_name
       FROM task_files
       WHERE id = $1 AND task_id = $2
       LIMIT 1`,
      [data.fileId, data.taskId]
    );
    if (!fileRow.rows.length) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }

    const { stored_name, original_name } = fileRow.rows[0];
    const filePath = path.join(TASK_FILES_ROOT, data.taskId, stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    const body = req.body as Buffer | undefined;
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibió contenido para sincronizar.' });
    }

    fs.writeFileSync(filePath, body);
    const stat = fs.statSync(filePath);

    await pool.query(
      `UPDATE task_files
       SET size_bytes = $1,
           updated_at = NOW()
       WHERE id = $2 AND task_id = $3`,
      [stat.size, data.fileId, data.taskId]
    );

    const taskInfo = await pool.query(`SELECT client_id FROM client_tasks WHERE id = $1 LIMIT 1`, [data.taskId]);
    const clientId = taskInfo.rows[0]?.client_id || null;

    await logActivity(
      'SYSTEM',
      'Sistema',
      `Adjunto actualizado desde Office: ${original_name}`,
      'TASK',
      data.taskId,
      original_name,
      { eventType: 'UPDATE' }
    );

    if (clientId) {
      await logActivity(
        'SYSTEM',
        'Sistema',
        `Adjunto de actuación actualizado desde Office: ${original_name}`,
        'CLIENT',
        clientId,
        original_name,
        { eventType: 'UPDATE' }
      );
    }

    res.json({ success: true, updated_at: stat.mtime.toISOString(), size_bytes: stat.size });
  } catch (e: any) {
    res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const launchTaskFileWithOffice = async (req: any, res: Response) => {
  const { token } = req.params;
  const data = _taskTempTokens.get(token);
  if (!data || data.exp < Date.now()) {
    return res.status(401).send('Token inválido o expirado.');
  }
  try {
    const fileRow = await getTaskFileRecord(data.taskId, data.fileId);
    if (!fileRow) {
      return res.status(404).send('Archivo no encontrado.');
    }

    const ext = (fileRow.original_name || '').split('.').pop()?.toLowerCase() ?? '';
    const excelExts = ['xls','xlsx','xlsm','xlsb','ods','csv'];
    const pptExts = ['ppt','pptx','odp'];
    const scheme = excelExts.includes(ext)
      ? 'ms-excel'
      : pptExts.includes(ext)
        ? 'ms-powerpoint'
        : 'ms-word';
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const fileUrl = `${proto}://${host}/api/tasks/files/dl/${token}`;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Location', `${scheme}:ofe|u|${fileUrl}`);
    res.status(302).end();
  } catch (e: any) {
    res.status(500).send(explainTaskError(e));
  }
};

export const taskOfficeBridgePage = async (req: any, res: Response) => {
  const { token } = req.params;
  const data = _taskTempTokens.get(token);
  if (!data || data.exp < Date.now()) {
    return res.status(401).send('Token inválido o expirado.');
  }
  try {
    const fileRow = await getTaskFileRecord(data.taskId, data.fileId);
    if (!fileRow) {
      return res.status(404).send('Archivo no encontrado.');
    }

    const ext = (fileRow.original_name || '').split('.').pop()?.toLowerCase() ?? '';
    const excelExts = ['xls','xlsx','xlsm','xlsb','ods','csv'];
    const pptExts = ['ppt','pptx','odp'];
    const scheme = excelExts.includes(ext)
      ? 'ms-excel'
      : pptExts.includes(ext)
        ? 'ms-powerpoint'
        : 'ms-word';
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const fileUrl = `${proto}://${host}/api/tasks/files/dl/${token}`;
    const officeUrl = `${scheme}:ofe|u|${fileUrl}`;
    const officeOnlineUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;
    const safeName = String(fileRow.original_name || 'documento').replace(/[&<>"]/g, (ch) => (
      ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'
    ));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Abrir documento</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; background: #f8fafc; color: #0f172a; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .card { width:min(520px, calc(100vw - 32px)); background:white; border:1px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 10px 30px rgba(15,23,42,.08); text-align:center; }
    h1 { font-size:20px; margin:0 0 8px; }
    p { color:#475569; line-height:1.5; margin-bottom:20px; }
    .btn-group { display:flex; flex-direction:column; gap:12px; }
    .btn { display:block; padding:14px 16px; text-decoration:none; border-radius:10px; font-weight:700; }
    .btn-primary { background:#dc2626; color:white; }
    .btn-secondary { background:#2b579a; color:white; }
    .hint { font-size:13px; color:#64748b; margin-top:16px; }
    #launcher-frame { display:none; width:0; height:0; border:0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Abrir documento</h1>
    <p>Estamos intentando abrir <strong>${safeName}</strong> en la aplicación de escritorio.</p>
    <div class="btn-group">
      <a href="${officeUrl}" class="btn btn-primary">Reintentar Word Escritorio</a>
      <a href="${officeOnlineUrl}" target="_blank" rel="noreferrer" class="btn btn-secondary">Abrir en Office Online</a>
    </div>
    <p class="hint">Si Word no se abre, usa Office Online para consultar el documento en el navegador.</p>
  </div>
  <iframe id="launcher-frame" title="office-launcher"></iframe>
  <script>
    function launch() {
      const frame = document.getElementById('launcher-frame');
      if (frame) frame.src = "${officeUrl}";
    }
    window.onload = () => {
      setTimeout(launch, 500);
    };
  </script>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(explainTaskError(e));
  }
};

export const previewTaskWordAsPdf = async (req: any, res: Response) => {
  if (!LIBREOFFICE_ENABLED) return res.status(503).json({ success: false, error: 'Vista previa PDF temporalmente no disponible.' });
  const { id, fileId } = req.params;
  try {
    const fileRow = await getTaskFileRecord(id, fileId);
    if (!fileRow) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }

    const { stored_name, original_name, mimetype } = fileRow;
    const ext = path.extname(original_name || stored_name || '').toLowerCase();
    const isWord =
      mimetype?.includes('word') ||
      mimetype?.includes('wordprocessingml') ||
      ext === '.doc' ||
      ext === '.docx';

    if (!isWord) {
      return res.status(400).json({ success: false, error: 'Este archivo no es Word.' });
    }

    const sourcePath = path.join(TASK_FILES_ROOT, id, stored_name);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    const srcStat = fs.statSync(sourcePath);
    const cacheKey = Buffer.from(`task:${id}:${fileId}:${sourcePath}`).toString('hex').slice(0, 32);
    const tempDir = path.join(TEMP_ROOT, `task_word_preview_${cacheKey}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const outputPdf = path.join(tempDir, `preview.pdf`);

    if (fs.existsSync(outputPdf)) {
      const pdfStat = fs.statSync(outputPdf);
      if (pdfStat.mtimeMs >= srcStat.mtimeMs) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent((original_name || 'preview').replace(/\.(docx?|DOCX?)$/, '.pdf'))}"`);
        return res.sendFile(outputPdf);
      }
    }

    try { if (fs.existsSync(outputPdf)) fs.unlinkSync(outputPdf); } catch (_) {}

    const converterScript = path.join(tempDir, `task_word_to_pdf_${cacheKey}.py`);
    const converterCode = `import sys, os, subprocess, shutil

source_path = sys.argv[1]
output_pdf = sys.argv[2]
converted = False

def convert_with_word_com(src, out_pdf):
    import win32com.client
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    doc = None
    try:
        doc = word.Documents.Open(src, False, True)
        doc.SaveAs(out_pdf, FileFormat=17)
    finally:
        if doc is not None:
            try: doc.Close(False)
            except Exception: pass
        try: word.Quit()
        except Exception: pass

try:
    convert_with_word_com(source_path, output_pdf)
    if os.path.exists(output_pdf):
        converted = True
except Exception:
    pass

if not converted:
    try:
        src_esc = source_path.replace("'", "''")
        out_esc = output_pdf.replace("'", "''")
        ps_cmd = (
            "$ErrorActionPreference='Stop';"
            "$w=New-Object -ComObject Word.Application;"
            "$w.Visible=$false;$w.DisplayAlerts=0;"
            "$d=$w.Documents.Open('" + src_esc + "',$false,$true);"
            "$d.SaveAs('" + out_esc + "',17);"
            "$d.Close($false);$w.Quit()"
        )
        r = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps_cmd],
            timeout=90, capture_output=True
        )
        if r.returncode == 0 and os.path.exists(output_pdf):
            converted = True
    except Exception:
        pass

if not converted:
    soffice_paths = [
        r'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        r'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        'soffice',
    ]
    out_dir = os.path.dirname(output_pdf)
    for soffice in soffice_paths:
        try:
            try:
                candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(source_path))[0] + '.pdf')
                if os.path.exists(candidate):
                    os.remove(candidate)
            except Exception:
                pass
            r = subprocess.run(
                [soffice, '--headless', '--convert-to', 'pdf', '--outdir', out_dir, source_path],
                timeout=90, capture_output=True
            )
            candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(source_path))[0] + '.pdf')
            if os.path.exists(candidate):
                if candidate != output_pdf:
                    shutil.move(candidate, output_pdf)
                if os.path.exists(output_pdf):
                    converted = True
                    break
        except Exception:
            continue

if converted and os.path.exists(output_pdf):
    print('OK')
    sys.exit(0)
print('FAILED')
sys.exit(1)
`;

    fs.writeFileSync(converterScript, converterCode, 'utf-8');
    const { execFile } = require('child_process');
    const pythonCmds = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

    const tryPython = (index: number) => {
      if (index >= pythonCmds.length) {
        try { fs.unlinkSync(converterScript); } catch (_) {}
        return res.status(503).json({
          success: false,
          error: 'No se pudo convertir el documento Word a PDF para la vista previa.',
        });
      }
      execFile(pythonCmds[index], [converterScript, sourcePath, outputPdf], { timeout: 120000 }, (err: any) => {
        const success = !err && fs.existsSync(outputPdf);
        if (!success) return tryPython(index + 1);
        try { fs.unlinkSync(converterScript); } catch (_) {}
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent((original_name || 'preview').replace(/\.(docx?|DOCX?)$/, '.pdf'))}"`);
        return res.sendFile(outputPdf);
      });
    };

    return tryPython(0);
  } catch (e: any) {
    return res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const previewTaskWordAsHtml = async (req: any, res: Response) => {
  const { id, fileId } = req.params;
  try {
    const fileRow = await getTaskFileRecord(id, fileId);
    if (!fileRow) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }

    const { stored_name, original_name, mimetype } = fileRow;
    const ext = path.extname(original_name || stored_name || '').toLowerCase();
    const isWord =
      mimetype?.includes('word') ||
      mimetype?.includes('wordprocessingml') ||
      ext === '.doc' ||
      ext === '.docx';

    if (!isWord) {
      return res.status(400).json({ success: false, error: 'Este archivo no es Word.' });
    }

    const filePath = path.join(TASK_FILES_ROOT, id, stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    let previewSourcePath = filePath;
    if (ext === '.doc') {
      const tempDir = TEMP_ROOT;
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const outputDocx = path.join(tempDir, `task_doc_preview_${fileId}.docx`);

      try {
        if (fs.existsSync(outputDocx)) {
          const srcMtime = fs.statSync(filePath).mtimeMs;
          const cacheMtime = fs.statSync(outputDocx).mtimeMs;
          if (cacheMtime >= srcMtime) {
            previewSourcePath = outputDocx;
          }
        }
      } catch (_) {}

      if (previewSourcePath === filePath) {
        const converterScript = path.join(tempDir, `task_doc_to_docx_${fileId}.py`);
        const converterCode = `import sys, os, subprocess, shutil

doc_path = sys.argv[1]
out_path = sys.argv[2]
converted = False

try:
    import win32com.client
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    doc = word.Documents.Open(doc_path, False, True)
    doc.SaveAs(out_path, FileFormat=16)
    doc.Close(False)
    word.Quit()
    if os.path.exists(out_path):
        converted = True
except Exception:
    pass

if not converted:
    try:
        doc_esc = doc_path.replace("'", "''")
        out_esc = out_path.replace("'", "''")
        ps_cmd = (
            "$ErrorActionPreference='Stop';"
            "$w=New-Object -ComObject Word.Application;"
            "$w.Visible=$false;$w.DisplayAlerts=0;"
            "$d=$w.Documents.Open('" + doc_esc + "',$false,$true);"
            "$d.SaveAs('" + out_esc + "',16);"
            "$d.Close($false);$w.Quit()"
        )
        r = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps_cmd],
            timeout=60, capture_output=True
        )
        if r.returncode == 0 and os.path.exists(out_path):
            converted = True
    except Exception:
        pass

if not converted:
    if sys.platform == 'win32':
        soffice_paths = [
            r'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            r'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
            'soffice',
        ]
    else:
        soffice_paths = ['soffice', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice']
    out_dir = os.path.dirname(out_path)
    for soffice in soffice_paths:
        try:
            r = subprocess.run(
                [soffice, '--headless', '--convert-to', 'docx', '--outdir', out_dir, doc_path],
                timeout=60, capture_output=True
            )
            candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(doc_path))[0] + '.docx')
            if os.path.exists(candidate):
                if candidate != out_path:
                    shutil.move(candidate, out_path)
                if os.path.exists(out_path):
                    converted = True
                    break
        except Exception:
            continue

print('OK' if converted else 'FAILED')
sys.exit(0 if converted else 1)
`;
        fs.writeFileSync(converterScript, converterCode, 'utf-8');
        const { execFile } = require('child_process');
        const pythonCmds = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

        let converted = false;
        for (const pythonCmd of pythonCmds) {
          const success = await new Promise<boolean>((resolve) => {
            execFile(pythonCmd, [converterScript, filePath, outputDocx], { timeout: 90000 }, (err: any) => {
              resolve(!err && fs.existsSync(outputDocx));
            });
          });
          if (success) {
            converted = true;
            break;
          }
        }
        try { fs.unlinkSync(converterScript); } catch (_) {}
        if (!converted) {
          return res.status(500).json({ success: false, error: 'No se pudo convertir el archivo .doc para generar la vista previa.' });
        }
        previewSourcePath = outputDocx;
      }
    }

    const tempDir = TEMP_ROOT;
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const scriptPath = path.join(tempDir, `task_preview_${fileId}.py`);
    const normalizedPath = previewSourcePath.replace(/\\/g, '/');

    const pythonScript = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io
from zipfile import ZipFile
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

try:
    file_path = sys.argv[1] if len(sys.argv) > 1 else '${normalizedPath}'
    with ZipFile(file_path, 'r') as docx:
        xml_content = docx.read('word/document.xml').decode('utf-8')
        root = ET.fromstring(xml_content.encode('utf-8'))
        ns = {'w': W_NS}
        paragraphs = []
        for para in root.findall('.//w:p', ns):
            parts = []
            for t in para.findall('.//w:t', ns):
                if t.text:
                    parts.append(t.text)
            text = ''.join(parts).strip()
            if text:
                paragraphs.append('<p style="margin:0 0 14px;line-height:1.65;color:#334155;font-size:15px;">' + esc(text) + '</p>')

        html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Calibri,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#0f172a}.sheet{background:white;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 10px 35px rgba(15,23,42,.08);padding:28px;max-width:980px;margin:0 auto}.tag{display:inline-block;margin-bottom:18px;padding:6px 10px;border-radius:999px;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{font-size:20px;margin:0 0 18px}</style></head><body><div class="sheet"><span class="tag">Vista previa Word</span><h1>' + esc('${stored_name}') + '</h1>' + ''.join(paragraphs if paragraphs else ['<p style="color:#94a3b8">No se ha podido extraer texto legible de este documento.</p>']) + '</div></body></html>'
        print(html)
except Exception as e:
    print('<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#b91c1c"><h3>Error al generar la vista previa</h3><p>' + esc(str(e)) + '</p></body></html>')
`;

    fs.writeFileSync(scriptPath, pythonScript);
    const { execFile } = require('child_process');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    execFile(pythonCmd, [scriptPath, previewSourcePath], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (error: any, stdout: any) => {
      try { fs.unlinkSync(scriptPath); } catch (_) {}
      if (error) {
        return res.status(500).json({ success: false, error: 'No se pudo generar la vista previa HTML del documento Word.' });
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(String(stdout || ''));
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const previewTaskExcelAsHtml = async (req: any, res: Response) => {
  const { id, fileId } = req.params;
  try {
    const fileRow = await getTaskFileRecord(id, fileId);
    if (!fileRow) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const { original_name } = fileRow;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
      body{margin:0;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a}
      .box{max-width:520px;margin:48px auto;background:white;border:1px solid #e2e8f0;border-radius:20px;padding:28px 30px;box-shadow:0 12px 40px rgba(15,23,42,.08)}
      .tag{display:inline-block;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
      h1{font-size:20px;margin:16px 0 8px}
      p{font-size:14px;line-height:1.6;color:#475569;margin:0 0 10px}
      code{display:block;margin-top:14px;padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;font-size:13px}
    </style></head><body><div class="box">
      <span class="tag">Vista previa limitada</span>
      <h1>Archivo de hoja de cálculo</h1>
      <p>La actuación contiene un archivo Excel, pero esta previsualización todavía no está disponible en este panel.</p>
      <p>Puedes seguir gestionando el adjunto desde la actuación y descargarlo solo si de verdad lo necesitas.</p>
      <code>${String(original_name || 'Archivo Excel').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>
    </div></body></html>`);
  } catch (e: any) {
    return res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const deleteTaskFile = async (req: any, res: Response) => {
  const { id, fileId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM task_files
       WHERE id = $1 AND task_id = $2
       RETURNING stored_name, original_name`,
      [fileId, id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }

    const { stored_name, original_name } = result.rows[0];
    const filePath = path.join(TASK_FILES_ROOT, id, stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await logActivityForReq(req, `Adjunto eliminado de actuación: ${original_name || stored_name}`, 'TASK', id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: explainTaskError(e) });
  }
};

export const updateTask = async (req: any, res: Response) => {
  const { id } = req.params;
  const { titulo, descripcion, plazo, fecha_aviso, estado, prioridad, expediente, tipo, juzgado, num_proc, importe, notas, etapa } = req.body;

  try {
    const existingQ = await pool.query(`SELECT * FROM client_tasks WHERE id = $1`, [id]);
    if (existingQ.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const existingTask = existingQ.rows[0];
    const userId = req.auth?.userId || existingTask.user_id || 'SYSTEM';
    const userName = existingTask.created_by || await resolveUserName(userId);

    const result = await pool.query(
      `UPDATE client_tasks
       SET titulo=$1, descripcion=$2, plazo=$3, fecha_aviso=$4, estado=$5, prioridad=$6,
           expediente=$7, tipo=$8, juzgado=$9, num_proc=$10,
           importe=$11, notas=$12, etapa=$13, updated_at=NOW()
       WHERE id=$14
       RETURNING *`,
      [
        titulo?.trim(),
        descripcion?.trim() || null,
        plazo || null,
        fecha_aviso || null,
        estado,
        prioridad,
        expediente?.trim() || null,
        tipo || 'otro',
        juzgado?.trim() || null,
        num_proc?.trim() || null,
        importe ? parseFloat(importe) : null,
        notas?.trim() || null,
        etapa?.trim() || null,
        id,
      ]
    );
    const updatedTask = result.rows[0];
    const agendaPayload = buildTaskAgendaPayload(updatedTask);

    // Igual que en la creación: la tarea ya se actualizó arriba, así que un fallo
    // al sincronizar con la Agenda no debe reportarse como si la tarea no se hubiera guardado.
    try {
      if (agendaPayload && updatedTask.agenda_event_id) {
        await pool.query(
          `UPDATE agenda_events
           SET title=$1, description=$2, start_at=$3, end_at=$4, all_day=$5,
               type=$6, status=$7, expediente_id=$8, cliente_id=$9,
               organization_context=$10, task_id=$11, updated_at=NOW()
           WHERE id=$12`,
          [
            agendaPayload.title,
            agendaPayload.description,
            agendaPayload.start_at,
            agendaPayload.end_at,
            agendaPayload.all_day,
            agendaPayload.type,
            agendaPayload.status,
            agendaPayload.expediente_id,
            agendaPayload.cliente_id,
            agendaPayload.organization_context,
            agendaPayload.task_id,
            updatedTask.agenda_event_id,
          ]
        );
      } else if (agendaPayload && !updatedTask.agenda_event_id) {
        const agendaRes = await pool.query(
          `INSERT INTO agenda_events
             (user_id, user_name, title, description, start_at, end_at, all_day,
              type, status, expediente_id, cliente_id, organization_context, source, task_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *`,
          [
            userId,
            userName,
            agendaPayload.title,
            agendaPayload.description,
            agendaPayload.start_at,
            agendaPayload.end_at,
            agendaPayload.all_day,
            agendaPayload.type,
            agendaPayload.status,
            agendaPayload.expediente_id,
            agendaPayload.cliente_id,
            agendaPayload.organization_context,
            agendaPayload.source,
            agendaPayload.task_id,
          ]
        );
        updatedTask.agenda_event_id = agendaRes.rows[0].id;
        await pool.query(
          `UPDATE client_tasks SET agenda_event_id = $1, updated_at = NOW() WHERE id = $2`,
          [updatedTask.agenda_event_id, updatedTask.id]
        );
      } else if (!agendaPayload && updatedTask.agenda_event_id) {
        await pool.query(`DELETE FROM agenda_events WHERE id = $1`, [updatedTask.agenda_event_id]);
        await pool.query(
          `UPDATE client_tasks SET agenda_event_id = NULL, updated_at = NOW() WHERE id = $1`,
          [updatedTask.id]
        );
        updatedTask.agenda_event_id = null;
      }
    } catch (agendaErr: any) {
      console.error('No se pudo sincronizar la tarea con la Agenda:', agendaErr?.message || agendaErr);
    }

    logActivityForReq(req, `Tarea modificada: ${updatedTask.titulo}`, 'TASK', id);
    res.json({ data: updatedTask });
  } catch (e: any) {
    res.status(500).json({ error: explainTaskError(e) });
  }
};

// ── PATCH /api/tasks/:id/estado ── (completar / reabrir rápido) ─
export const patchTaskEstado = async (req: any, res: Response) => {
  const { id } = req.params;
  const { estado } = req.body;
  if (!['pendiente', 'urgente', 'completada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const result = await pool.query(
      `UPDATE client_tasks SET estado=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [estado, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const updatedTask = result.rows[0];
    if (updatedTask.agenda_event_id) {
      await pool.query(
        `UPDATE agenda_events SET status = $1, updated_at = NOW() WHERE id = $2`,
        [mapTaskEstadoToAgendaStatus(estado), updatedTask.agenda_event_id]
      );
    }
    const estadoLabel = estado === 'completada' ? 'completada' : estado === 'urgente' ? 'marcada urgente' : 'reabierta';
    logActivityForReq(req, `Tarea ${estadoLabel}: ${updatedTask.titulo}`, 'TASK', id);
    res.json({ data: updatedTask });
  } catch (e: any) {
    res.status(500).json({ error: explainTaskError(e) });
  }
};

// ── DELETE /api/tasks/:id ──────────────────────────────────────
export const deleteTask = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const beforeDelete = await pool.query(`SELECT agenda_event_id FROM client_tasks WHERE id = $1`, [id]);
    const { rows } = await pool.query(`DELETE FROM client_tasks WHERE id=$1 RETURNING titulo, client_id`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const agendaEventId = beforeDelete.rows[0]?.agenda_event_id;
    if (agendaEventId) {
      await pool.query(`DELETE FROM agenda_events WHERE id = $1`, [agendaEventId]);
    }
    logActivityForReq(req, `Tarea eliminada: ${rows[0].titulo}`, 'CLIENT', rows[0].client_id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /api/tasks/indicators/:clientId ────────────────────────
// Devuelve métricas calculadas para el panel lateral de indicadores
export const getIndicators = async (req: any, res: Response) => {
  const { clientId } = req.params;
  try {
    // Tareas
    const tasksQ = await pool.query(
      `SELECT
        COUNT(*)                                                           AS total_tareas,
        COUNT(*) FILTER (WHERE estado != 'completada')                     AS tareas_pendientes,
        COUNT(*) FILTER (WHERE estado = 'urgente')                         AS tareas_urgentes,
        COUNT(*) FILTER (WHERE estado != 'completada' AND plazo < CURRENT_DATE) AS tareas_vencidas,
        COUNT(*) FILTER (WHERE estado = 'completada')                      AS tareas_completadas
       FROM client_tasks WHERE client_id = $1`,
      [clientId]
    );

    // Archivos
    const filesQ = await pool.query(
      `SELECT COUNT(*) AS total_archivos FROM client_files WHERE client_id = $1`,
      [clientId]
    );

    // Notas
    const notesQ = await pool.query(
      `SELECT COUNT(*) AS total_notas FROM notes WHERE client_id = $1`,
      [clientId]
    );

    // Actuaciones (activity_log)
    const actQ = await pool.query(
      `SELECT MAX(created_at) AS ultima_actuacion,
              COUNT(*)::int   AS total_actuaciones
       FROM activity_log
       WHERE entity_id = $1 AND entity_type = 'CLIENT'
         AND action_type NOT LIKE 'Nota%'`,
      [clientId]
    );

    // Expedientes
    const expQ = await pool.query(
      `SELECT COUNT(*)::int AS total_expedientes FROM expedientes WHERE cliente_id = $1`,
      [clientId]
    );

    // Días desde alta del cliente
    const clientQ = await pool.query(
      `SELECT date_alta, client_status, address_street, address_town FROM entities WHERE id = $1`,
      [clientId]
    );

    const t = tasksQ.rows[0];
    const ultimaAct = actQ.rows[0]?.ultima_actuacion;
    const diasSinActuacion = ultimaAct
      ? Math.floor((Date.now() - new Date(ultimaAct).getTime()) / 86400000)
      : null;

    const clientRow = clientQ.rows[0];
    const diasDesdeAlta = clientRow?.date_alta
      ? Math.floor((Date.now() - new Date(clientRow.date_alta).getTime()) / 86400000)
      : null;
    const tieneDomicilio = !!(clientRow?.address_street || clientRow?.address_town);

    res.json({
      data: {
        total_tareas:       Number(t.total_tareas),
        tareas_pendientes:  Number(t.tareas_pendientes),
        tareas_urgentes:    Number(t.tareas_urgentes),
        tareas_vencidas:    Number(t.tareas_vencidas),
        tareas_completadas: Number(t.tareas_completadas),
        total_archivos:     Number(filesQ.rows[0].total_archivos),
        total_notas:        Number(notesQ.rows[0].total_notas),
        total_actuaciones:  Number(actQ.rows[0]?.total_actuaciones ?? 0),
        total_expedientes:  Number(expQ.rows[0]?.total_expedientes ?? 0),
        dias_sin_actuacion: diasSinActuacion,
        dias_desde_alta:    diasDesdeAlta,
        tiene_domicilio:    tieneDomicilio,
        client_status:      clientRow?.client_status || '—',
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /api/tasks/indicators/expediente/:expedienteId ──────────
export const getExpedienteIndicators = async (req: any, res: Response) => {
  const { expedienteId } = req.params;
  try {
    const [tasksQ, filesQ, notesQ, actQ, expQ, apuntesQ] = await Promise.all([
      pool.query(
        `SELECT
          COUNT(*)                                                           AS total_tareas,
          COUNT(*) FILTER (WHERE estado != 'completada')                     AS tareas_pendientes,
          COUNT(*) FILTER (WHERE estado = 'urgente')                         AS tareas_urgentes,
          COUNT(*) FILTER (WHERE estado != 'completada' AND plazo < CURRENT_DATE) AS tareas_vencidas,
          COUNT(*) FILTER (WHERE estado = 'completada')                      AS tareas_completadas
         FROM client_tasks WHERE expediente_id = $1`,
        [expedienteId],
      ),
      pool.query(
        `SELECT COUNT(*) AS total_archivos FROM client_files WHERE client_id = $1`,
        [expedienteId],
      ),
      pool.query(
        `SELECT COUNT(*) AS total_notas FROM notes WHERE expediente_id = $1`,
        [expedienteId],
      ),
      pool.query(
        `SELECT MAX(created_at) AS ultima_actuacion, COUNT(*)::int AS total_actuaciones
         FROM activity_log WHERE entity_id = $1 AND entity_type = 'EXPEDIENTE'`,
        [expedienteId],
      ),
      pool.query(
        `SELECT e.anio, e.num_exp, e.descripcion, e.estado, e.fecha_inicio,
                e.etapa, e.tipo, e.cliente_id,
                ent.first_name, ent.last_name, ent.commercial_name
         FROM expedientes e
         LEFT JOIN entities ent ON ent.id = e.cliente_id
         WHERE e.id = $1`,
        [expedienteId],
      ),
      pool.query(
        `SELECT
          COALESCE(SUM(importe) FILTER (WHERE tipo='cobro'),   0) AS total_cobrado,
          COALESCE(SUM(importe) FILTER (WHERE tipo='cargo'),   0) AS total_cargos,
          COALESCE(SUM(importe) FILTER (WHERE tipo='abono'),   0) AS total_abonos
         FROM expediente_apuntes WHERE expediente_id = $1`,
        [expedienteId],
      ),
    ]);

    const t    = tasksQ.rows[0];
    const exp  = expQ.rows[0];
    const ap   = apuntesQ.rows[0];
    const ultimaAct = actQ.rows[0]?.ultima_actuacion;
    const diasSinActuacion = ultimaAct
      ? Math.floor((Date.now() - new Date(ultimaAct).getTime()) / 86400000)
      : null;
    const diasDesdeApertura = exp?.fecha_inicio
      ? Math.floor((Date.now() - new Date(exp.fecha_inicio).getTime()) / 86400000)
      : null;

    const clienteNombre = exp
      ? (exp.commercial_name || [exp.first_name, exp.last_name].filter(Boolean).join(' ') || '—')
      : '—';

    res.json({
      data: {
        total_tareas:       Number(t.total_tareas),
        tareas_pendientes:  Number(t.tareas_pendientes),
        tareas_urgentes:    Number(t.tareas_urgentes),
        tareas_vencidas:    Number(t.tareas_vencidas),
        tareas_completadas: Number(t.tareas_completadas),
        total_archivos:     Number(filesQ.rows[0].total_archivos),
        total_notas:        Number(notesQ.rows[0].total_notas),
        total_actuaciones:  Number(actQ.rows[0]?.total_actuaciones ?? 0),
        dias_sin_actuacion: diasSinActuacion,
        dias_desde_apertura: diasDesdeApertura,
        estado:             exp?.estado || '—',
        etapa:              exp?.etapa  || '—',
        cliente_nombre:     clienteNombre,
        total_cobrado:      Number(ap?.total_cobrado ?? 0),
        total_cargos:       Number(ap?.total_cargos  ?? 0),
        saldo:              Number(ap?.total_cargos ?? 0) - Number(ap?.total_cobrado ?? 0),
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /api/tasks/etapas ── lista de etapas disponibles ───────
export const getEtapas = async (_req: any, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, orden FROM task_etapas ORDER BY orden ASC, nombre ASC`
    );
    res.json({ data: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── POST /api/tasks/etapas ── crear nueva etapa ─────────────────
export const createEtapa = async (req: any, res: Response) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    // Obtener el orden máximo actual
    const maxRes = await pool.query(`SELECT COALESCE(MAX(orden),0) AS max FROM task_etapas`);
    const nextOrden = Number(maxRes.rows[0].max) + 1;
    const result = await pool.query(
      `INSERT INTO task_etapas (nombre, orden) VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING *`,
      [nombre.trim(), nextOrden]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ── DELETE /api/tasks/etapas/:id ── eliminar etapa (las tareas asignadas pasan a "Sin etapa") ──
export const deleteEtapa = async (req: any, res: Response) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const etapaRes = await client.query(`SELECT nombre FROM task_etapas WHERE id = $1`, [id]);
    if (etapaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Etapa no encontrada' });
    }
    await client.query(
      `UPDATE client_tasks SET etapa = NULL, updated_at = NOW() WHERE etapa = $1`,
      [etapaRes.rows[0].nombre]
    );
    await client.query(`DELETE FROM task_etapas WHERE id = $1`, [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
};

// ── PATCH /api/tasks/etapas/reorder ── reordenar columnas del Kanban ────────
export const reorderEtapas = async (req: any, res: Response) => {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids es obligatorio' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE task_etapas SET orden = $1 WHERE id = $2`, [i, ids[i]]);
    }
    await client.query('COMMIT');
    const result = await pool.query(`SELECT id, nombre, orden FROM task_etapas ORDER BY orden ASC, nombre ASC`);
    res.json({ data: result.rows });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
};
