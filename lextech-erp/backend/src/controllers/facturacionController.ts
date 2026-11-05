import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';
import { syncQuipuForUserInternal, pushFacturaToQuipuInternal, getQuipuOrganizacion } from './quipuController';
import { resolveUserOrgMemberships } from './organizacionesController';
import { enviarCorreoDelDespacho, escaparHtml, SinCuentaCorreo } from '../utils/correoDespacho';

const QUIPU_STALE_MS = 15 * 60 * 1000; // 15 minutes

const explainBillingError = (error: any) => {
  const raw = String(error?.message || '');
  if (raw.startsWith('Ya existe una factura con el numero ')) {
    return raw;
  }
  if (raw.includes('ux_facturacion_facturas_user_serie_num')) {
    return 'No se puede repetir el numero de factura dentro de la misma serie.';
  }
  if (raw.includes('invalid input syntax for type numeric')) {
    return 'No se pudo guardar el registro porque el importe no tiene un formato válido.';
  }
  if (raw.includes('invalid input syntax for type date')) {
    return 'No se pudo guardar el registro porque una fecha no tiene un formato válido.';
  }
  if (raw.includes('null value in column')) {
    return 'No se pudo guardar el registro porque falta un dato obligatorio.';
  }
  return 'No se pudo procesar la operación de facturación.';
};

const sanitizeText = (value: any) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const sanitizeAmount = (value: any) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const sanitizeOptionalAmount = (value: any, fallback: number | null = null) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const buildFacturaDisplayNumber = (num: any, serie?: any) => {
  const cleanNum = sanitizeText(num);
  const cleanSerie = sanitizeText(serie);
  if (!cleanNum) return 'sin numero';
  return cleanSerie ? `${cleanSerie}-${cleanNum}` : cleanNum;
};

const ensureFacturaNumberAvailable = async (
  organizacionId: string,
  num: any,
  serie: any,
  excludeId?: string | null,
) => {
  const cleanNum = sanitizeText(num);
  const cleanSerie = sanitizeText(serie) || 'HON';
  if (!cleanNum) return;

  const duplicated = await pool.query(
    `SELECT id
       FROM facturacion_facturas
      WHERE organizacion_id = $1
        AND LOWER(num) = LOWER($2)
        AND LOWER(COALESCE(serie, '')) = LOWER($3)
        AND ($4::uuid IS NULL OR id <> $4::uuid)
      LIMIT 1`,
    [organizacionId, cleanNum, cleanSerie, excludeId || null],
  );

  if (duplicated.rows.length > 0) {
    throw new Error(`Ya existe una factura con el numero ${buildFacturaDisplayNumber(cleanNum, cleanSerie)}. No se puede repetir.`);
  }
};

const mapQuipuStatusToErp = (status: string): string => {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'cobrada';
  if (s === 'overdue') return 'vencida';
  if (s === 'sent' || s === 'issued') return 'enviada';
  return 'pendiente';
};

export const getBillingBootstrap = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;

  try {
    const [facturas, gastos, presupuestos, clientes, expedientes, misOrganizaciones, procuradores] = await Promise.all([
      pool.query(`
        SELECT ff.*,
               e.anio,
               e.num_exp,
               e.ref_expediente,
               e.ref_propia,
               e.descripcion AS expediente_descripcion,
               o.nombre AS organizacion_nombre
        FROM facturacion_facturas ff
        LEFT JOIN expedientes e ON e.id = ff.expediente_id
        LEFT JOIN organizaciones o ON o.id = ff.organizacion_id
        WHERE ff.organizacion_id = $1
        ORDER BY ff.fecha DESC, ff.created_at DESC
      `, [organizacionId]),
      pool.query(`
        SELECT fg.*, o.nombre AS organizacion_nombre,
               NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS procurador_nombre,
               p.email AS procurador_email,
               e.anio, e.num_exp, e.ref_expediente, e.ref_propia, e.descripcion AS expediente_descripcion
        FROM facturacion_gastos fg
        LEFT JOIN organizaciones o ON o.id = fg.organizacion_id
        LEFT JOIN directorio_profesionales p ON p.id = fg.procurador_id AND p.organizacion_id = fg.organizacion_id
        LEFT JOIN expedientes e ON e.id = fg.expediente_id AND e.organizacion_id = fg.organizacion_id
        WHERE fg.organizacion_id = $1
        ORDER BY fg.fecha DESC, fg.created_at DESC
      `, [organizacionId]),
      pool.query(`
        SELECT fp.*,
               e.anio,
               e.num_exp,
               e.ref_expediente,
               e.ref_propia,
               e.descripcion AS expediente_descripcion,
               o.nombre AS organizacion_nombre
        FROM facturacion_presupuestos fp
        LEFT JOIN expedientes e ON e.id = fp.expediente_id
        LEFT JOIN organizaciones o ON o.id = fp.organizacion_id
        WHERE fp.organizacion_id = $1
        ORDER BY fp.fecha DESC, fp.created_at DESC
      `, [organizacionId]),
      pool.query(`
        SELECT e.id,
               e.first_name,
               e.last_name,
               e.commercial_name,
               e.client_status,
               (
                 SELECT COUNT(*)::int
                 FROM expedientes exp
                 WHERE exp.cliente_id = e.id
               ) AS total_expedientes
        FROM entities e
        WHERE e.type = 'CLIENTE' AND e.organizacion_id = $1
        ORDER BY e.first_name ASC, e.last_name ASC
      `, [organizacionId]),
      pool.query(`
        SELECT ex.id,
               ex.cliente_id,
               ex.anio,
               ex.num_exp,
               ex.ref_expediente,
               ex.ref_propia,
               ex.descripcion,
               COALESCE(ent.first_name || COALESCE(' ' || ent.last_name, ''), ex.cliente_nombre, 'Sin cliente') AS cliente_nombre
        FROM expedientes ex
        LEFT JOIN entities ent ON ent.id = ex.cliente_id
        WHERE ex.organizacion_id = $1
        ORDER BY ex.updated_at DESC NULLS LAST, ex.created_at DESC NULLS LAST
      `, [organizacionId]),
      resolveUserOrgMemberships(userId),
      pool.query(`
        SELECT id, first_name, last_name, email, despacho
        FROM directorio_profesionales
        WHERE organizacion_id = $1 AND tipo = 'PROCURADOR'
        ORDER BY first_name ASC, last_name ASC
      `, [organizacionId]).catch(() => ({ rows: [] as any[] })),
    ]);

    // Quipu pertenece a una organización: sus datos solo se mezclan aquí si es
    // la activa. Antes se etiquetaban con la organización abierta, así que las
    // facturas de Quipu de un despacho aparecían como dinero de cualquier otro.
    const quipuOrg = await getQuipuOrganizacion(userId).catch(() => null);
    const quipuAqui = Boolean(quipuOrg && quipuOrg.id === organizacionId);

    // Obtener facturas de Quipu que aún no están importadas en facturacion_facturas
    let quipuRows: any[] = [];
    if (quipuAqui) try {
      const quipuFacturas = await pool.query(`
        SELECT qi.id, qi.external_id,
               qi.number AS num, qi.contact_name AS contacto,
               qi.issue_date AS fecha, qi.due_date AS vencimiento,
               qi.total_amount AS total, qi.status
        FROM quipu_invoices qi
        WHERE qi.user_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM facturacion_facturas ff
            WHERE ff.user_id = $1 AND ff.quipu_id = qi.external_id
          )
        ORDER BY qi.issue_date DESC NULLS LAST
      `, [userId]);
      const orgActiva = misOrganizaciones.find((o) => o.organizacionId === organizacionId);
      quipuRows = quipuFacturas.rows.map((qi: any) => ({
        id: qi.id, user_id: userId,
        num: qi.num || qi.external_id || '—',
        contacto: qi.contacto || 'Quipu',
        fecha: qi.fecha, vencimiento: qi.vencimiento,
        total: Number(qi.total || 0),
        estado: mapQuipuStatusToErp(qi.status),
        area: 'procesal', responsable: 'Quipu',
        forma_pago: 'transferencia', serie: 'QUIPU', tipo_cliente: 'empresa',
        client_id: null, expediente_id: null, quipu_id: qi.external_id,
        anio: null, num_exp: null, ref_expediente: null, ref_propia: null,
        expediente_descripcion: null,
        organizacion_id: organizacionId, organizacion_nombre: orgActiva?.organizacionNombre || null,
      }));
    } catch { /* quipu_invoices may not exist */ }

    const todasFacturas = [...facturas.rows, ...quipuRows];

    // Quipu synced contacts and bank accounts (loaded from local DB after sync)
    let quipuContactsRows: any[] = [];
    let quipuBankAccountsRows: any[] = [];
    if (quipuAqui) try {
      const [qc, qba] = await Promise.all([
        pool.query(
          `SELECT external_id AS id, kind, contact_name AS name, tax_id, email
           FROM quipu_contacts WHERE user_id = $1 ORDER BY contact_name ASC`,
          [userId],
        ),
        pool.query(
          `SELECT external_id AS id, name, iban, current_balance AS balance, bank_name, currency_code
           FROM quipu_bank_accounts WHERE user_id = $1 ORDER BY name ASC`,
          [userId],
        ).catch(() => ({ rows: [] as any[] })),
      ]);
      quipuContactsRows = qc.rows;
      quipuBankAccountsRows = qba.rows;
    } catch { /* quipu tables may not exist yet */ }

    res.json({
      success: true,
      data: {
        facturas:          todasFacturas,
        gastos:            gastos.rows,
        procuradores:      procuradores.rows,
        presupuestos:      presupuestos.rows,
        clientes:          clientes.rows,
        expedientes:       expedientes.rows,
        quipuContacts:     quipuContactsRows,
        quipuBankAccounts: quipuBankAccountsRows,
        organizaciones:    misOrganizaciones.map((o) => ({ id: o.organizacionId, nombre: o.organizacionNombre })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const createFactura = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const userName = await resolveUserName(userId);
  const {
    num, contacto, fecha, vencimiento, total, estado, area, responsable,
    formaPago, serie, tipoCliente, clientId, expedienteId, concepto, notas,
    baseUnitaria, cantidad, descuentoPct, ivaPct, irpfPct,
  } = req.body;

  if (!sanitizeText(num) || !sanitizeText(contacto) || sanitizeAmount(total) === null) {
    return res.status(400).json({ success: false, error: 'Número, cliente e importe son obligatorios.' });
  }
  if (!sanitizeText(clientId)) {
    return res.status(400).json({ success: false, error: 'Selecciona un cliente del despacho.' });
  }

  try {
    await ensureFacturaNumberAvailable(organizacionId, num, serie);
    const result = await pool.query(
      `INSERT INTO facturacion_facturas
         (user_id, created_by, num, contacto, fecha, vencimiento, total, estado, area, responsable, forma_pago, serie, tipo_cliente, client_id, expediente_id, concepto, notas, base_unitaria, cantidad, descuento_pct, iva_pct, irpf_pct, organizacion_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        userId,
        userName,
        sanitizeText(num),
        sanitizeText(contacto),
        fecha || null,
        vencimiento || null,
        sanitizeAmount(total),
        sanitizeText(estado) || 'pendiente',
        sanitizeText(area) || 'procesal',
        sanitizeText(responsable) || userName,
        sanitizeText(formaPago) || 'transferencia',
        sanitizeText(serie) || 'HON',
        sanitizeText(tipoCliente) || 'empresa',
        sanitizeText(clientId),
        sanitizeText(expedienteId),
        sanitizeText(concepto),
        sanitizeText(notas),
        sanitizeOptionalAmount(baseUnitaria),
        sanitizeOptionalAmount(cantidad, 1),
        sanitizeOptionalAmount(descuentoPct, 0),
        sanitizeOptionalAmount(ivaPct, 21),
        sanitizeOptionalAmount(irpfPct, 0),
        organizacionId,
      ],
    );
    await logActivityForReq(req, `Factura creada: ${sanitizeText(num)}`, 'FACTURACION_FACTURA', result.rows[0].id, sanitizeText(contacto) || undefined, 'CREATE');

    // Auto-push to Quipu in background if connected
    const newId = result.rows[0].id;
    // Solo si el Quipu del usuario es de la organización de esta factura.
    pool.query(`SELECT 1 FROM quipu_settings WHERE user_id=$1 AND organizacion_id=$2 LIMIT 1`, [userId, organizacionId]).then(qs => {
      if (qs.rows.length > 0) {
        pushFacturaToQuipuInternal(userId, newId).catch(e =>
          console.error('[AutoPush/Quipu] factura=%s err=%s', newId, e?.message),
        );
      }
    }).catch(() => {});

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const updateFactura = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const {
    num, contacto, fecha, vencimiento, total, estado, area, responsable,
    formaPago, serie, tipoCliente, clientId, expedienteId, concepto, notas,
    baseUnitaria, cantidad, descuentoPct, ivaPct, irpfPct,
  } = req.body;

  try {
    await ensureFacturaNumberAvailable(organizacionId, num, serie, id);
    const result = await pool.query(
      `UPDATE facturacion_facturas
       SET num = $3,
           contacto = $4,
           fecha = $5,
           vencimiento = $6,
           total = $7,
           estado = $8,
           area = $9,
           responsable = $10,
           forma_pago = $11,
           serie = $12,
           tipo_cliente = $13,
           client_id = $14,
           expediente_id = $15,
           concepto = $16,
           notas = $17,
           base_unitaria = $18,
           cantidad = $19,
           descuento_pct = $20,
           iva_pct = $21,
           irpf_pct = $22,
           updated_at = NOW()
       WHERE id = $1 AND organizacion_id = $2
       RETURNING *`,
      [
        id,
        organizacionId,
        sanitizeText(num),
        sanitizeText(contacto),
        fecha || null,
        vencimiento || null,
        sanitizeAmount(total),
        sanitizeText(estado),
        sanitizeText(area),
        sanitizeText(responsable),
        sanitizeText(formaPago),
        sanitizeText(serie),
        sanitizeText(tipoCliente),
        sanitizeText(clientId),
        sanitizeText(expedienteId),
        sanitizeText(concepto),
        sanitizeText(notas),
        sanitizeOptionalAmount(baseUnitaria),
        sanitizeOptionalAmount(cantidad, 1),
        sanitizeOptionalAmount(descuentoPct, 0),
        sanitizeOptionalAmount(ivaPct, 21),
        sanitizeOptionalAmount(irpfPct, 0),
      ],
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Factura no encontrada.' });
    await logActivityForReq(req, `Factura actualizada: ${sanitizeText(num)}`, 'FACTURACION_FACTURA', id, sanitizeText(contacto) || undefined, 'UPDATE');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const deleteFactura = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });

  try {
    const result = await pool.query(`DELETE FROM facturacion_facturas WHERE id = $1 AND organizacion_id = $2 RETURNING num, contacto`, [id, organizacionId]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Factura no encontrada.' });
    await logActivityForReq(req, `Factura eliminada: ${result.rows[0].num}`, 'FACTURACION_FACTURA', id, result.rows[0].contacto, 'DELETE');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

const FORMAS_PAGO = ['transferencia', 'tarjeta', 'domiciliacion', 'bizum', 'efectivo'];

// Datos de "pago a procurador" de un gasto, validados contra el despacho
// activo (el procurador y el expediente tienen que ser suyos). Si es un pago
// en efectivo a un procurador, el gasto necesita su recibo.
async function datosPagoGasto(organizacionId: string, body: any) {
  const formaPago = FORMAS_PAGO.includes(String(body.formaPago)) ? String(body.formaPago) : null;
  let procuradorId: string | null = sanitizeText(body.procuradorId);
  let expedienteId: string | null = sanitizeText(body.expedienteId);
  if (procuradorId) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM directorio_profesionales WHERE id = $1 AND organizacion_id = $2 AND tipo = 'PROCURADOR'`,
      [procuradorId, organizacionId],
    ).catch(() => ({ rowCount: 0 }));
    if (!rowCount) procuradorId = null;
  }
  if (expedienteId) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [expedienteId, organizacionId],
    ).catch(() => ({ rowCount: 0 }));
    if (!rowCount) expedienteId = null;
  }
  return {
    formaPago, procuradorId, expedienteId,
    concepto: sanitizeText(body.concepto),
    necesitaRecibo: Boolean(procuradorId && formaPago === 'efectivo'),
  };
}

export const createGasto = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const userName = await resolveUserName(userId);
  const { num, proveedor, fecha, total, cat, estado, area, responsable, deducible } = req.body;

  if (!sanitizeText(num) || !sanitizeText(proveedor) || sanitizeAmount(total) === null) {
    return res.status(400).json({ success: false, error: 'Número, proveedor e importe son obligatorios.' });
  }

  try {
    const pago = await datosPagoGasto(organizacionId, req.body);
    const result = await pool.query(
      `INSERT INTO facturacion_gastos
         (user_id, created_by, num, proveedor, fecha, total, categoria, estado, area, responsable, deducible, organizacion_id,
          forma_pago, procurador_id, expediente_id, concepto, recibo_estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        userId,
        userName,
        sanitizeText(num),
        sanitizeText(proveedor),
        fecha || null,
        sanitizeAmount(total),
        sanitizeText(cat) || 'General',
        sanitizeText(estado) || 'pendiente',
        sanitizeText(area) || 'procesal',
        sanitizeText(responsable) || userName,
        Boolean(deducible),
        organizacionId,
        pago.formaPago,
        pago.procuradorId,
        pago.expedienteId,
        pago.concepto,
        pago.necesitaRecibo ? 'pendiente' : null,
      ],
    );
    await logActivityForReq(req, `Gasto creado: ${sanitizeText(num)}`, 'FACTURACION_GASTO', result.rows[0].id, sanitizeText(proveedor) || undefined, 'CREATE');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const updateGasto = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const { num, proveedor, fecha, total, cat, estado, area, responsable, deducible } = req.body;

  try {
    const pago = await datosPagoGasto(organizacionId, req.body);
    const result = await pool.query(
      `UPDATE facturacion_gastos
       SET num = $3,
           proveedor = $4,
           fecha = $5,
           total = $6,
           categoria = $7,
           estado = $8,
           area = $9,
           responsable = $10,
           deducible = $11,
           forma_pago = $12,
           procurador_id = $13,
           expediente_id = $14,
           concepto = $15,
           -- Si sigue siendo un pago en efectivo a un procurador se conserva
           -- en qué punto está el recibo; si deja de serlo, ya no hace falta.
           recibo_estado = CASE WHEN $16::boolean THEN COALESCE(recibo_estado, 'pendiente') ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1 AND organizacion_id = $2
       RETURNING *`,
      [id, organizacionId, sanitizeText(num), sanitizeText(proveedor), fecha || null, sanitizeAmount(total), sanitizeText(cat), sanitizeText(estado), sanitizeText(area), sanitizeText(responsable), Boolean(deducible),
       pago.formaPago, pago.procuradorId, pago.expedienteId, pago.concepto, pago.necesitaRecibo],
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Gasto no encontrado.' });
    await logActivityForReq(req, `Gasto actualizado: ${sanitizeText(num)}`, 'FACTURACION_GASTO', id, sanitizeText(proveedor) || undefined, 'UPDATE');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const deleteGasto = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });

  try {
    const result = await pool.query(`DELETE FROM facturacion_gastos WHERE id = $1 AND organizacion_id = $2 RETURNING num, proveedor`, [id, organizacionId]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Gasto no encontrado.' });
    await logActivityForReq(req, `Gasto eliminado: ${result.rows[0].num}`, 'FACTURACION_GASTO', id, result.rows[0].proveedor, 'DELETE');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

const fmtEur = (n: any) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fmtFecha = (d: any) => (d ? new Date(d).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : '');

// Pide por correo al procurador el recibo de un pago en efectivo.
export const solicitarReciboGasto = async (req: any, res: Response) => {
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  try {
    const { rows } = await pool.query(
      `SELECT g.*, p.first_name, p.last_name, p.email AS procurador_email, o.nombre AS despacho,
              e.anio, e.num_exp, e.ref_expediente, e.descripcion AS expediente_descripcion
       FROM facturacion_gastos g
       JOIN directorio_profesionales p ON p.id = g.procurador_id AND p.organizacion_id = g.organizacion_id
       JOIN organizaciones o ON o.id = g.organizacion_id
       LEFT JOIN expedientes e ON e.id = g.expediente_id AND e.organizacion_id = g.organizacion_id
       WHERE g.id = $1 AND g.organizacion_id = $2`,
      [req.params.id, organizacionId],
    );
    const g = rows[0];
    if (!g) return res.status(404).json({ success: false, error: 'Pago al procurador no encontrado.' });
    if (!g.recibo_estado) return res.status(400).json({ success: false, error: 'Este gasto no necesita recibo (no es un pago en efectivo a un procurador).' });
    const email = String(g.procurador_email || '').trim();
    if (!email) return res.status(400).json({ success: false, error: 'El procurador no tiene correo en el Directorio. Añádeselo o imprime el recibo para que lo firme.' });

    const nombre = [g.first_name, g.last_name].filter(Boolean).join(' ');
    const expediente = g.expediente_id
      ? [g.ref_expediente || (g.num_exp && g.anio ? `${g.num_exp}/${g.anio}` : ''), g.expediente_descripcion].filter(Boolean).join(' · ')
      : '';
    const html = `<p>Estimado/a ${escaparHtml(nombre)}:</p>
<p>El ${escaparHtml(fmtFecha(g.fecha))} le abonamos <strong>en efectivo ${escaparHtml(fmtEur(g.total))}</strong>${g.concepto ? ` en concepto de ${escaparHtml(g.concepto)}` : ''}${expediente ? `, correspondiente al expediente ${escaparHtml(expediente)}` : ''}.</p>
<p>Para nuestra contabilidad, le rogamos que nos remita el <strong>recibo firmado</strong> de dicho pago respondiendo a este correo.</p>
<p>Muchas gracias. Un saludo,<br>${escaparHtml(g.despacho || '')}</p>`;
    await enviarCorreoDelDespacho(organizacionId, {
      to: [email],
      subject: `Solicitud de recibo · pago en efectivo de ${fmtEur(g.total)}`,
      html,
    });
    const upd = await pool.query(
      `UPDATE facturacion_gastos SET recibo_estado = CASE WHEN recibo_estado = 'recibido' THEN recibo_estado ELSE 'solicitado' END,
              recibo_solicitado_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organizacion_id = $2 RETURNING *`,
      [g.id, organizacionId],
    );
    await logActivityForReq(req, `Recibo solicitado al procurador ${nombre}`, 'FACTURACION_GASTO', g.id, nombre, 'UPDATE');
    res.json({ success: true, data: upd.rows[0], enviadoA: email });
  } catch (error: any) {
    if (error instanceof SinCuentaCorreo) return res.status(400).json({ success: false, error: error.message });
    console.warn('solicitarReciboGasto:', error?.message || error);
    res.status(500).json({ success: false, error: 'No se pudo enviar el correo al procurador.' });
  }
};

// Marca (o desmarca) que el recibo del procurador ya está en el despacho.
export const marcarReciboGasto = async (req: any, res: Response) => {
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const recibido = req.body?.recibido !== false;
  try {
    const { rows } = await pool.query(
      `UPDATE facturacion_gastos
       SET recibo_estado = CASE WHEN $3::boolean THEN 'recibido'
                                WHEN recibo_solicitado_at IS NOT NULL THEN 'solicitado' ELSE 'pendiente' END,
           recibo_recibido_at = CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1 AND organizacion_id = $2 AND recibo_estado IS NOT NULL
       RETURNING *`,
      [req.params.id, organizacionId, recibido],
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Pago al procurador no encontrado.' });
    await logActivityForReq(req, recibido ? 'Recibo del procurador recibido' : 'Recibo del procurador marcado como pendiente', 'FACTURACION_GASTO', rows[0].id, rows[0].proveedor, 'UPDATE');
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const createPresupuesto = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const userName = await resolveUserName(userId);
  const { num, contacto, fecha, total, estado, area, responsable, iguala, clientId, expedienteId } = req.body;

  if (!sanitizeText(num) || !sanitizeText(contacto) || sanitizeAmount(total) === null) {
    return res.status(400).json({ success: false, error: 'Número, cliente e importe son obligatorios.' });
  }
  if (!sanitizeText(clientId)) {
    return res.status(400).json({ success: false, error: 'Selecciona un cliente del despacho.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO facturacion_presupuestos
         (user_id, created_by, num, contacto, fecha, total, estado, area, responsable, iguala, client_id, expediente_id, organizacion_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [userId, userName, sanitizeText(num), sanitizeText(contacto), fecha || null, sanitizeAmount(total), sanitizeText(estado) || 'pendiente', sanitizeText(area) || 'procesal', sanitizeText(responsable) || userName, Boolean(iguala), sanitizeText(clientId), sanitizeText(expedienteId), organizacionId],
    );
    await logActivityForReq(req, `Presupuesto creado: ${sanitizeText(num)}`, 'FACTURACION_PRESUPUESTO', result.rows[0].id, sanitizeText(contacto) || undefined, 'CREATE');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const updatePresupuesto = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const { num, contacto, fecha, total, estado, area, responsable, iguala, clientId, expedienteId } = req.body;

  try {
    const result = await pool.query(
      `UPDATE facturacion_presupuestos
       SET num = $3,
           contacto = $4,
           fecha = $5,
           total = $6,
           estado = $7,
           area = $8,
           responsable = $9,
           iguala = $10,
           client_id = $11,
           expediente_id = $12,
           updated_at = NOW()
       WHERE id = $1 AND organizacion_id = $2
       RETURNING *`,
      [id, organizacionId, sanitizeText(num), sanitizeText(contacto), fecha || null, sanitizeAmount(total), sanitizeText(estado), sanitizeText(area), sanitizeText(responsable), Boolean(iguala), sanitizeText(clientId), sanitizeText(expedienteId)],
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Presupuesto no encontrado.' });
    await logActivityForReq(req, `Presupuesto actualizado: ${sanitizeText(num)}`, 'FACTURACION_PRESUPUESTO', id, sanitizeText(contacto) || undefined, 'UPDATE');
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const deletePresupuesto = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });

  try {
    const result = await pool.query(`DELETE FROM facturacion_presupuestos WHERE id = $1 AND organizacion_id = $2 RETURNING num, contacto`, [id, organizacionId]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Presupuesto no encontrado.' });
    await logActivityForReq(req, `Presupuesto eliminado: ${result.rows[0].num}`, 'FACTURACION_PRESUPUESTO', id, result.rows[0].contacto, 'DELETE');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

// ── Cuentas bancarias manuales ────────────────────────────────
export const listBankAccounts = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  try {
    const result = await pool.query(
      `SELECT * FROM billing_bank_accounts WHERE organizacion_id=$1 ORDER BY name ASC`, [organizacionId]);
    res.json({ success: true, data: result.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e?.message }); }
};

export const createBankAccount = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const { name, bank_name, iban, balance, currency, notes } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'El nombre es obligatorio.' });
  try {
    const r = await pool.query(
      `INSERT INTO billing_bank_accounts (user_id,name,bank_name,iban,balance,currency,notes,organizacion_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, name, bank_name||null, iban||null, Number(balance||0), currency||'EUR', notes||null, organizacionId]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e: any) { res.status(500).json({ success: false, error: e?.message }); }
};

export const updateBankAccount = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  const { name, bank_name, iban, balance, currency, notes } = req.body;
  try {
    const r = await pool.query(
      `UPDATE billing_bank_accounts SET name=$3,bank_name=$4,iban=$5,balance=$6,currency=$7,notes=$8,updated_at=NOW()
       WHERE id=$1 AND organizacion_id=$2 RETURNING *`,
      [id, organizacionId, name, bank_name||null, iban||null, Number(balance||0), currency||'EUR', notes||null]);
    if (!r.rowCount) return res.status(404).json({ success: false, error: 'Cuenta no encontrada.' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e: any) { res.status(500).json({ success: false, error: e?.message }); }
};

export const deleteBankAccount = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const organizacionId = req.organizacionId;
  if (!organizacionId) return res.status(400).json({ success: false, error: 'No se pudo determinar la organización activa.' });
  try {
    await pool.query(`DELETE FROM billing_bank_accounts WHERE id=$1 AND organizacion_id=$2`, [id, organizacionId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e?.message }); }
};
