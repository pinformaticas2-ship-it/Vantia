"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIndicators = exports.deleteTask = exports.patchTaskEstado = exports.updateTask = exports.createTask = exports.getTasks = void 0;
const database_1 = __importDefault(require("../config/database"));
const activityController_1 = require("./activityController");
const getTasks = async (req, res) => {
    const { clientId } = req.params;
    try {
        const result = await database_1.default.query(`SELECT * FROM client_tasks WHERE client_id = $1 ORDER BY
        CASE estado WHEN 'urgente' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END,
        plazo ASC NULLS LAST,
        created_at DESC`, [clientId]);
        res.json({ data: result.rows });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.getTasks = getTasks;
const createTask = async (req, res) => {
    const { clientId } = req.params;
    const { titulo, descripcion, plazo, estado, prioridad, expediente, tipo, juzgado, num_proc } = req.body;
    if (!titulo?.trim())
        return res.status(400).json({ error: 'El título es obligatorio' });
    try {
        const result = await database_1.default.query(`INSERT INTO client_tasks (client_id, titulo, descripcion, plazo, estado, prioridad, expediente, tipo, juzgado, num_proc, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`, [
            clientId,
            titulo.trim(),
            descripcion?.trim() || null,
            plazo || null,
            estado || 'pendiente',
            prioridad || 'media',
            expediente?.trim() || null,
            tipo || 'otro',
            juzgado?.trim() || null,
            num_proc?.trim() || null,
            req.auth?.userId || 'SYSTEM',
        ]);
        (0, activityController_1.logActivityForReq)(req, `Tarea creada: ${titulo.trim()}`, 'CLIENT', clientId);
        res.status(201).json({ data: result.rows[0] });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.createTask = createTask;
const updateTask = async (req, res) => {
    const { id } = req.params;
    const { titulo, descripcion, plazo, estado, prioridad, expediente, tipo, juzgado, num_proc } = req.body;
    try {
        const result = await database_1.default.query(`UPDATE client_tasks
       SET titulo=$1, descripcion=$2, plazo=$3, estado=$4, prioridad=$5, expediente=$6,
           tipo=$7, juzgado=$8, num_proc=$9, updated_at=NOW()
       WHERE id=$10
       RETURNING *`, [
            titulo?.trim(),
            descripcion?.trim() || null,
            plazo || null,
            estado,
            prioridad,
            expediente?.trim() || null,
            tipo || 'otro',
            juzgado?.trim() || null,
            num_proc?.trim() || null,
            id,
        ]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Tarea no encontrada' });
        res.json({ data: result.rows[0] });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.updateTask = updateTask;
const patchTaskEstado = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    if (!['pendiente', 'urgente', 'completada'].includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    try {
        const result = await database_1.default.query(`UPDATE client_tasks SET estado=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [estado, id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Tarea no encontrada' });
        res.json({ data: result.rows[0] });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.patchTaskEstado = patchTaskEstado;
const deleteTask = async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await database_1.default.query(`DELETE FROM client_tasks WHERE id=$1 RETURNING titulo, client_id`, [id]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'Tarea no encontrada' });
        (0, activityController_1.logActivityForReq)(req, `Tarea eliminada: ${rows[0].titulo}`, 'CLIENT', rows[0].client_id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.deleteTask = deleteTask;
const getIndicators = async (req, res) => {
    const { clientId } = req.params;
    try {
        const tasksQ = await database_1.default.query(`SELECT
        COUNT(*)                                                           AS total_tareas,
        COUNT(*) FILTER (WHERE estado != 'completada')                     AS tareas_pendientes,
        COUNT(*) FILTER (WHERE estado = 'urgente')                         AS tareas_urgentes,
        COUNT(*) FILTER (WHERE estado != 'completada' AND plazo < NOW())   AS tareas_vencidas,
        COUNT(*) FILTER (WHERE estado = 'completada')                      AS tareas_completadas
       FROM client_tasks WHERE client_id = $1`, [clientId]);
        const filesQ = await database_1.default.query(`SELECT COUNT(*) AS total_archivos FROM client_files WHERE client_id = $1`, [clientId]);
        const notesQ = await database_1.default.query(`SELECT COUNT(*) AS total_notas FROM notes WHERE client_id = $1`, [clientId]);
        const actQ = await database_1.default.query(`SELECT MAX(created_at) AS ultima_actuacion,
              COUNT(*)::int   AS total_actuaciones
       FROM activity_log
       WHERE entity_id = $1 AND entity_type = 'CLIENT'`, [clientId]);
        const expQ = await database_1.default.query(`SELECT COUNT(*)::int AS total_expedientes FROM expedientes WHERE cliente_id = $1`, [clientId]);
        const clientQ = await database_1.default.query(`SELECT date_alta, client_status, address_street, address_town FROM entities WHERE id = $1`, [clientId]);
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
                total_tareas: Number(t.total_tareas),
                tareas_pendientes: Number(t.tareas_pendientes),
                tareas_urgentes: Number(t.tareas_urgentes),
                tareas_vencidas: Number(t.tareas_vencidas),
                tareas_completadas: Number(t.tareas_completadas),
                total_archivos: Number(filesQ.rows[0].total_archivos),
                total_notas: Number(notesQ.rows[0].total_notas),
                total_actuaciones: Number(actQ.rows[0]?.total_actuaciones ?? 0),
                total_expedientes: Number(expQ.rows[0]?.total_expedientes ?? 0),
                dias_sin_actuacion: diasSinActuacion,
                dias_desde_alta: diasDesdeAlta,
                tiene_domicilio: tieneDomicilio,
                client_status: clientRow?.client_status || '—',
            }
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.getIndicators = getIndicators;
