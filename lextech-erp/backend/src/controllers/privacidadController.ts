import { Request, Response } from 'express';
import pool from '../config/database';
import { logActivityForReq } from './activityController';

// ── Datos y privacidad (14/10/2026) ──────────────────────────────────────────
// Ajustes → Despacho → Datos y privacidad (solo propietario/administradores):
//  · cuánto tiempo se guarda la trazabilidad (el RGPD pide no guardar datos
//    personales -- IP, horarios de los empleados -- más de lo necesario);
//  · exportar los datos del despacho (portabilidad, copia propia).

const pgErr = (e: any) => `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;
const esGestor = (req: Request) => ['propietario', 'admin'].includes((req as any).organizacionRol);
export const RETENCIONES_VALIDAS = [6, 12, 24, 36, 60];

export const getPrivacidad = async (req: Request, res: Response) => {
  if (!esGestor(req)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
  try {
    const organizacionId = (req as any).organizacionId;
    const { rows } = await pool.query(
      `SELECT o.trazabilidad_retencion_meses AS meses,
              (SELECT MIN(created_at) FROM activity_log WHERE organizacion_id = o.id) AS desde,
              (SELECT COUNT(*)::int FROM activity_log WHERE organizacion_id = o.id) AS registros
         FROM organizaciones o WHERE o.id = $1`,
      [organizacionId],
    );
    res.json({ success: true, data: { retencionMeses: rows[0]?.meses ?? null, desde: rows[0]?.desde ?? null, registros: rows[0]?.registros ?? 0, opciones: RETENCIONES_VALIDAS } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

/** PUT /api/privacidad { retencionMeses: 6|12|24|36|60|null } */
export const putPrivacidad = async (req: Request, res: Response) => {
  if (!esGestor(req)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
  const raw = req.body?.retencionMeses;
  const meses = raw === null ? null : Number(raw);
  if (meses !== null && !RETENCIONES_VALIDAS.includes(meses)) return res.status(400).json({ success: false, error: 'Elige 6, 12, 24, 36 o 60 meses, o sin límite.' });
  try {
    const organizacionId = (req as any).organizacionId;
    await pool.query(`UPDATE organizaciones SET trazabilidad_retencion_meses = $2 WHERE id = $1`, [organizacionId, meses]);
    await logActivityForReq(req, meses ? `Trazabilidad: se guarda ${meses} meses` : 'Trazabilidad: se guarda sin límite', 'ORGANIZACION', organizacionId, undefined, 'UPDATE');
    const borrados = meses ? await purgarTrazabilidad(organizacionId, meses) : 0;
    res.json({ success: true, data: { retencionMeses: meses, borrados } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

async function purgarTrazabilidad(organizacionId: string, meses: number): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM activity_log WHERE organizacion_id = $1 AND created_at < NOW() - make_interval(months => $2)`,
    [organizacionId, meses],
  );
  return rowCount || 0;
}

/** Borra lo que se haya quedado fuera del plazo en cada organización (una vez al día). */
export async function runPurgaTrazabilidad(): Promise<void> {
  try {
    const { rows } = await pool.query(`SELECT id, trazabilidad_retencion_meses AS meses FROM organizaciones WHERE trazabilidad_retencion_meses IS NOT NULL`);
    for (const o of rows) {
      const n = await purgarTrazabilidad(o.id, o.meses);
      if (n) console.log(`[privacidad] trazabilidad: ${n} registros de más de ${o.meses} meses borrados (org ${o.id})`);
    }
  } catch (e: any) {
    console.warn('[privacidad] purga de trazabilidad:', e?.message || e);
  }
}

export function startPurgaTrazabilidad(): void {
  setTimeout(() => {
    void runPurgaTrazabilidad();
    setInterval(() => void runPurgaTrazabilidad(), 24 * 60 * 60 * 1000);
  }, 60_000);
}

// Qué se exporta. Solo tablas con organizacion_id (se comprueba al vuelo, por
// si alguna no existe en esta instalación). No van los correos ni los chats:
// son de cada persona, no del despacho.
const EXPORTABLES: { clave: string; tabla: string; etiqueta: string }[] = [
  { clave: 'clientes_y_contactos', tabla: 'entities', etiqueta: 'Clientes, procuradores, abogados y contrarios' },
  { clave: 'expedientes', tabla: 'expedientes', etiqueta: 'Expedientes' },
  { clave: 'tareas', tabla: 'client_tasks', etiqueta: 'Tareas' },
  { clave: 'agenda', tabla: 'agenda_events', etiqueta: 'Agenda' },
  { clave: 'facturas', tabla: 'facturacion_facturas', etiqueta: 'Facturas' },
  { clave: 'gastos', tabla: 'facturacion_gastos', etiqueta: 'Gastos' },
  { clave: 'presupuestos', tabla: 'facturacion_presupuestos', etiqueta: 'Presupuestos' },
  { clave: 'vistas', tabla: 'vistas_solicitudes', etiqueta: 'Vistas' },
  { clave: 'miembros', tabla: 'organizacion_miembros', etiqueta: 'Miembros del despacho' },
  { clave: 'trazabilidad', tabla: 'activity_log', etiqueta: 'Trazabilidad' },
];
// Columnas que nunca salen (secretos).
const COLUMNAS_OCULTAS = /password|token|secret|_enc$|api_key/i;

/** GET /api/privacidad/exportar — un JSON con los datos del despacho. */
export const exportarDatos = async (req: Request, res: Response) => {
  if (!esGestor(req)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
  const organizacionId = (req as any).organizacionId;
  try {
    const { rows: org } = await pool.query(`SELECT id, nombre, nif_cif, direccion_fiscal, created_at FROM organizaciones WHERE id = $1`, [organizacionId]).catch(() => ({ rows: [] as any[] }));
    const { rows: conOrg } = await pool.query(
      `SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'organizacion_id'`,
    );
    const tablasConOrg = new Set(conOrg.map((r: any) => r.table_name));
    const datos: Record<string, any> = {};
    const resumen: { seccion: string; registros: number }[] = [];
    for (const e of EXPORTABLES) {
      if (!tablasConOrg.has(e.tabla)) continue;
      const { rows } = await pool.query(`SELECT * FROM ${e.tabla} WHERE organizacion_id = $1`, [organizacionId]);
      datos[e.clave] = rows.map((r: any) => Object.fromEntries(Object.entries(r).filter(([k]) => !COLUMNAS_OCULTAS.test(k))));
      resumen.push({ seccion: e.etiqueta, registros: rows.length });
    }
    // Recordatorios de expediente (cuelgan del expediente, no llevan organización propia).
    const { rows: recordatorios } = await pool.query(
      `SELECT n.* FROM exp_notificaciones n JOIN expedientes e ON e.id = n.expediente_id WHERE e.organizacion_id = $1`,
      [organizacionId],
    ).catch(() => ({ rows: [] as any[] }));
    datos.recordatorios_de_expediente = recordatorios.map((r: any) => Object.fromEntries(Object.entries(r).filter(([k]) => !COLUMNAS_OCULTAS.test(k))));
    resumen.push({ seccion: 'Recordatorios de expediente', registros: recordatorios.length });

    await logActivityForReq(req, 'Exportación completa de los datos del despacho', 'ORGANIZACION', organizacionId, undefined, 'EXPORT');
    const nombre = String(org[0]?.nombre || 'despacho').replace(/[^\w-]+/g, '_').slice(0, 40);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vantia-${nombre}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify({ exportado: new Date().toISOString(), organizacion: org[0] || { id: organizacionId }, resumen, datos }, null, 2));
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};
