"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExpediente = exports.updateExpediente = exports.createExpediente = exports.getExpediente = exports.getStats = exports.getExpedientes = void 0;
const database_1 = __importDefault(require("../config/database"));
const activityController_1 = require("./activityController");
function reqUserName(req) {
    const c = req.auth?.sessionClaims;
    if (!c)
        return req.auth?.userId || 'Sistema';
    return c.name || c.full_name
        || [c.first_name, c.last_name].filter(Boolean).join(' ')
        || c.email || req.auth?.userId || 'Sistema';
}
const getExpedientes = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const estado = (req.query.estado || '');
        const tipo = (req.query.tipo || '');
        const anio = parseInt(req.query.anio) || 0;
        const clienteId = (req.query.clienteId || '').trim();
        const limit = Math.min(parseInt(req.query.limit) || 300, 500);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const conds = [];
        const vals = [];
        let p = 1;
        if (q) {
            conds.push(`(
        e.descripcion ILIKE $${p} OR e.ref_propia ILIKE $${p}
        OR e.cliente_nombre ILIKE $${p} OR e.contrario ILIKE $${p}
        OR e.juzgado ILIKE $${p} OR e.nig ILIKE $${p}
        OR e.num_autos ILIKE $${p}
        OR CAST(e.num_exp AS TEXT) ILIKE $${p}
      )`);
            vals.push(`%${q}%`);
            p++;
        }
        if (estado) {
            conds.push(`e.estado     = $${p}`);
            vals.push(estado);
            p++;
        }
        if (tipo) {
            conds.push(`e.tipo       = $${p}`);
            vals.push(tipo);
            p++;
        }
        if (anio) {
            conds.push(`e.anio       = $${p}`);
            vals.push(anio);
            p++;
        }
        if (clienteId) {
            conds.push(`e.cliente_id = $${p}`);
            vals.push(clienteId);
            p++;
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const sql = `
      SELECT e.*,
             ent.first_name || COALESCE(' ' || ent.last_name, '') AS cliente_nombre_linked
      FROM expedientes e
      LEFT JOIN entities ent ON ent.id = e.cliente_id
      ${where}
      ORDER BY e.anio DESC, e.num_exp DESC
      LIMIT $${p} OFFSET $${p + 1}
    `;
        vals.push(limit, offset);
        const countSql = `SELECT COUNT(*) FROM expedientes e ${where}`;
        const [rows, countRow] = await Promise.all([
            database_1.default.query(sql, vals),
            database_1.default.query(countSql, vals.slice(0, -2)),
        ]);
        res.json({ data: rows.rows, total: parseInt(countRow.rows[0].count) });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.getExpedientes = getExpedientes;
const getStats = async (_req, res) => {
    try {
        const r = await database_1.default.query(`
      SELECT
        COUNT(*)                                         AS total,
        COUNT(*) FILTER (WHERE estado = 'abierto')       AS abiertos,
        COUNT(*) FILTER (WHERE estado = 'cerrado')       AS cerrados,
        COUNT(*) FILTER (WHERE estado = 'suspendido')    AS suspendidos,
        COUNT(*) FILTER (WHERE estado = 'archivado')     AS archivados,
        EXTRACT(YEAR FROM NOW())::int                    AS anio_actual,
        COUNT(*) FILTER (WHERE anio = EXTRACT(YEAR FROM NOW())::int) AS este_anio
      FROM expedientes
    `);
        res.json({ data: r.rows[0] });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.getStats = getStats;
const getExpediente = async (req, res) => {
    try {
        const r = await database_1.default.query(`SELECT e.*, ent.first_name || COALESCE(' ' || ent.last_name, '') AS cliente_nombre_linked,
              ent.phone_1, ent.phone_mobile, ent.email AS cliente_email
       FROM expedientes e
       LEFT JOIN entities ent ON ent.id = e.cliente_id
       WHERE e.id = $1`, [req.params.id]);
        if (!r.rows.length)
            return res.status(404).json({ error: 'Expediente no encontrado' });
        res.json({ data: r.rows[0] });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.getExpediente = getExpediente;
const createExpediente = async (req, res) => {
    const { anio, ref_propia, ref_expediente, descripcion, tipo, cliente_id, cliente_nombre, contrario, procurador, juzgado, tipo_proc, num_autos, nig, estado, observaciones, fecha_inicio, fecha_cierre, importe, tipos_asunto, cuantia_principal, intereses, costas, cuantia_total, indeterminado, etapa, persona_contacto, contacto, centro, color, } = req.body;
    try {
        const yr = anio || new Date().getFullYear();
        const maxR = await database_1.default.query(`SELECT COALESCE(MAX(num_exp), 0) + 1 AS next FROM expedientes WHERE anio = $1`, [yr]);
        const num_exp = maxR.rows[0].next;
        let nombre = cliente_nombre || null;
        if (cliente_id && !nombre) {
            const cr = await database_1.default.query(`SELECT first_name || COALESCE(' ' || last_name, '') AS n FROM entities WHERE id = $1`, [cliente_id]);
            nombre = cr.rows[0]?.n || null;
        }
        const r = await database_1.default.query(`INSERT INTO expedientes
         (anio, num_exp, ref_propia, ref_expediente, descripcion, tipo,
          cliente_id, cliente_nombre, contrario, procurador, juzgado,
          tipo_proc, num_autos, nig, estado, observaciones,
          fecha_inicio, fecha_cierre, importe,
          tipos_asunto, cuantia_principal, intereses, costas, cuantia_total,
          indeterminado, etapa, persona_contacto, contacto, centro, color,
          created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
       RETURNING *`, [
            yr, num_exp,
            ref_propia?.trim() || null, ref_expediente?.trim() || null,
            descripcion?.trim() || null, tipo || 'judicial',
            cliente_id || null, nombre,
            contrario?.trim() || null, procurador?.trim() || null,
            juzgado?.trim() || null, tipo_proc?.trim() || null,
            num_autos?.trim() || null, nig?.trim() || null,
            estado || 'abierto',
            observaciones?.trim() || null,
            fecha_inicio || null, fecha_cierre || null,
            importe || null,
            tipos_asunto?.trim() || null,
            cuantia_principal != null ? cuantia_principal : null,
            intereses != null ? intereses : null,
            costas != null ? costas : null,
            cuantia_total != null ? cuantia_total : null,
            indeterminado === true || indeterminado === 'true',
            etapa?.trim() || null,
            persona_contacto?.trim() || null,
            contacto?.trim() || null,
            centro?.trim() || null,
            color?.trim() || 'ninguno',
            reqUserName(req),
        ]);
        (0, activityController_1.logActivityForReq)(req, `Expediente creado: ${yr}/${num_exp} — ${descripcion || ''}`, 'EXPEDIENTE', r.rows[0].id);
        res.status(201).json({ data: r.rows[0] });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.createExpediente = createExpediente;
const updateExpediente = async (req, res) => {
    const { ref_propia, ref_expediente, descripcion, tipo, cliente_id, cliente_nombre, contrario, procurador, juzgado, tipo_proc, num_autos, nig, estado, observaciones, fecha_inicio, fecha_cierre, importe, tipos_asunto, cuantia_principal, intereses, costas, cuantia_total, indeterminado, etapa, persona_contacto, contacto, centro, color, } = req.body;
    try {
        let nombre = cliente_nombre || null;
        if (cliente_id && !nombre) {
            const cr = await database_1.default.query(`SELECT first_name || COALESCE(' ' || last_name, '') AS n FROM entities WHERE id = $1`, [cliente_id]);
            nombre = cr.rows[0]?.n || null;
        }
        const r = await database_1.default.query(`UPDATE expedientes SET
         ref_propia=$1, ref_expediente=$2, descripcion=$3, tipo=$4,
         cliente_id=$5, cliente_nombre=$6, contrario=$7, procurador=$8,
         juzgado=$9, tipo_proc=$10, num_autos=$11, nig=$12,
         estado=$13, observaciones=$14, fecha_inicio=$15, fecha_cierre=$16,
         importe=$17,
         tipos_asunto=$18, cuantia_principal=$19, intereses=$20, costas=$21,
         cuantia_total=$22, indeterminado=$23, etapa=$24,
         persona_contacto=$25, contacto=$26, centro=$27, color=$28,
         updated_at=NOW()
       WHERE id=$29 RETURNING *`, [
            ref_propia?.trim() || null, ref_expediente?.trim() || null,
            descripcion?.trim() || null, tipo || 'judicial',
            cliente_id || null, nombre,
            contrario?.trim() || null, procurador?.trim() || null,
            juzgado?.trim() || null, tipo_proc?.trim() || null,
            num_autos?.trim() || null, nig?.trim() || null,
            estado || 'abierto',
            observaciones?.trim() || null,
            fecha_inicio || null, fecha_cierre || null,
            importe || null,
            tipos_asunto?.trim() || null,
            cuantia_principal != null ? cuantia_principal : null,
            intereses != null ? intereses : null,
            costas != null ? costas : null,
            cuantia_total != null ? cuantia_total : null,
            indeterminado === true || indeterminado === 'true',
            etapa?.trim() || null,
            persona_contacto?.trim() || null,
            contacto?.trim() || null,
            centro?.trim() || null,
            color?.trim() || 'ninguno',
            req.params.id,
        ]);
        if (!r.rows.length)
            return res.status(404).json({ error: 'Expediente no encontrado' });
        res.json({ data: r.rows[0] });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.updateExpediente = updateExpediente;
const deleteExpediente = async (req, res) => {
    try {
        const r = await database_1.default.query(`DELETE FROM expedientes WHERE id=$1 RETURNING anio, num_exp, descripcion`, [req.params.id]);
        if (!r.rows.length)
            return res.status(404).json({ error: 'Expediente no encontrado' });
        (0, activityController_1.logActivityForReq)(req, `Expediente eliminado: ${r.rows[0].anio}/${r.rows[0].num_exp}`, 'EXPEDIENTE', req.params.id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
};
exports.deleteExpediente = deleteExpediente;
