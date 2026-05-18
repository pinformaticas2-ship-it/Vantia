import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';

const explainBillingError = (error: any) => {
  const raw = String(error?.message || '');
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

  try {
    const [facturas, gastos, presupuestos, clientes, expedientes] = await Promise.all([
      pool.query(`
        SELECT ff.*,
               e.anio,
               e.num_exp,
               e.ref_expediente,
               e.ref_propia,
               e.descripcion AS expediente_descripcion
        FROM facturacion_facturas ff
        LEFT JOIN expedientes e ON e.id = ff.expediente_id
        WHERE ff.user_id = $1
        ORDER BY ff.fecha DESC, ff.created_at DESC
      `, [userId]),
      pool.query(`SELECT * FROM facturacion_gastos WHERE user_id = $1 ORDER BY fecha DESC, created_at DESC`, [userId]),
      pool.query(`
        SELECT fp.*,
               e.anio,
               e.num_exp,
               e.ref_expediente,
               e.ref_propia,
               e.descripcion AS expediente_descripcion
        FROM facturacion_presupuestos fp
        LEFT JOIN expedientes e ON e.id = fp.expediente_id
        WHERE fp.user_id = $1
        ORDER BY fp.fecha DESC, fp.created_at DESC
      `, [userId]),
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
        WHERE e.type = 'CLIENTE'
        ORDER BY e.first_name ASC, e.last_name ASC
      `),
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
        ORDER BY ex.updated_at DESC NULLS LAST, ex.created_at DESC NULLS LAST
      `),
    ]);

    // Obtener facturas de Quipu que aún no están importadas en facturacion_facturas
    let quipuRows: any[] = [];
    try {
      const quipuFacturas = await pool.query(`
        SELECT qi.id,
               qi.external_id,
               qi.number      AS num,
               qi.contact_name AS contacto,
               qi.issue_date   AS fecha,
               qi.due_date     AS vencimiento,
               qi.total_amount AS total,
               qi.status
        FROM quipu_invoices qi
        WHERE qi.user_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM facturacion_facturas ff
            WHERE ff.user_id = $1
              AND ff.quipu_id = qi.external_id
          )
        ORDER BY qi.issue_date DESC NULLS LAST
      `, [userId]);

      quipuRows = quipuFacturas.rows.map((qi: any) => ({
        id:                   qi.id,
        user_id:              userId,
        num:                  qi.num || qi.external_id || '—',
        contacto:             qi.contacto || 'Quipu',
        fecha:                qi.fecha,
        vencimiento:          qi.vencimiento,
        total:                Number(qi.total || 0),
        estado:               mapQuipuStatusToErp(qi.status),
        area:                 'procesal',
        responsable:          'Quipu',
        forma_pago:           'transferencia',
        serie:                'QUIPU',
        tipo_cliente:         'empresa',
        client_id:            null,
        expediente_id:        null,
        quipu_id:             qi.external_id,
        // campos de expediente vacíos para que el mapper no falle
        anio:                 null,
        num_exp:              null,
        ref_expediente:       null,
        ref_propia:           null,
        expediente_descripcion: null,
      }));
    } catch (_e: any) {
      // quipu_invoices puede no existir si nunca se configuró Quipu
    }

    // Combinar: primero facturas locales, luego las de Quipu no importadas aún
    const todasFacturas = [...facturas.rows, ...quipuRows];

    res.json({
      success: true,
      data: {
        facturas:     todasFacturas,
        gastos:       gastos.rows,
        presupuestos: presupuestos.rows,
        clientes:     clientes.rows,
        expedientes:  expedientes.rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const createFactura = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const userName = await resolveUserName(userId);
  const {
    num, contacto, fecha, vencimiento, total, estado, area, responsable,
    formaPago, serie, tipoCliente, clientId, expedienteId,
  } = req.body;

  if (!sanitizeText(num) || !sanitizeText(contacto) || sanitizeAmount(total) === null) {
    return res.status(400).json({ success: false, error: 'Número, cliente e importe son obligatorios.' });
  }
  if (!sanitizeText(clientId) || !sanitizeText(expedienteId)) {
    return res.status(400).json({ success: false, error: 'Selecciona un cliente del despacho y su expediente asociado.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO facturacion_facturas
         (user_id, created_by, num, contacto, fecha, vencimiento, total, estado, area, responsable, forma_pago, serie, tipo_cliente, client_id, expediente_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
      ],
    );
    await logActivityForReq(req, `Factura creada: ${sanitizeText(num)}`, 'FACTURACION_FACTURA', result.rows[0].id, sanitizeText(contacto) || undefined, 'CREATE');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const updateFactura = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const {
    num, contacto, fecha, vencimiento, total, estado, area, responsable,
    formaPago, serie, tipoCliente, clientId, expedienteId,
  } = req.body;

  try {
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
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        userId,
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

  try {
    const result = await pool.query(`DELETE FROM facturacion_facturas WHERE id = $1 AND user_id = $2 RETURNING num, contacto`, [id, userId]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Factura no encontrada.' });
    await logActivityForReq(req, `Factura eliminada: ${result.rows[0].num}`, 'FACTURACION_FACTURA', id, result.rows[0].contacto, 'DELETE');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const createGasto = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const userName = await resolveUserName(userId);
  const { num, proveedor, fecha, total, cat, estado, area, responsable, deducible } = req.body;

  if (!sanitizeText(num) || !sanitizeText(proveedor) || sanitizeAmount(total) === null) {
    return res.status(400).json({ success: false, error: 'Número, proveedor e importe son obligatorios.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO facturacion_gastos
         (user_id, created_by, num, proveedor, fecha, total, categoria, estado, area, responsable, deducible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
  const { num, proveedor, fecha, total, cat, estado, area, responsable, deducible } = req.body;

  try {
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
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, sanitizeText(num), sanitizeText(proveedor), fecha || null, sanitizeAmount(total), sanitizeText(cat), sanitizeText(estado), sanitizeText(area), sanitizeText(responsable), Boolean(deducible)],
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

  try {
    const result = await pool.query(`DELETE FROM facturacion_gastos WHERE id = $1 AND user_id = $2 RETURNING num, proveedor`, [id, userId]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Gasto no encontrado.' });
    await logActivityForReq(req, `Gasto eliminado: ${result.rows[0].num}`, 'FACTURACION_GASTO', id, result.rows[0].proveedor, 'DELETE');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};

export const createPresupuesto = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const userName = await resolveUserName(userId);
  const { num, contacto, fecha, total, estado, area, responsable, iguala, clientId, expedienteId } = req.body;

  if (!sanitizeText(num) || !sanitizeText(contacto) || sanitizeAmount(total) === null) {
    return res.status(400).json({ success: false, error: 'Número, cliente e importe son obligatorios.' });
  }
  if (!sanitizeText(clientId) || !sanitizeText(expedienteId)) {
    return res.status(400).json({ success: false, error: 'Selecciona un cliente del despacho y su expediente asociado.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO facturacion_presupuestos
         (user_id, created_by, num, contacto, fecha, total, estado, area, responsable, iguala, client_id, expediente_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [userId, userName, sanitizeText(num), sanitizeText(contacto), fecha || null, sanitizeAmount(total), sanitizeText(estado) || 'pendiente', sanitizeText(area) || 'procesal', sanitizeText(responsable) || userName, Boolean(iguala), sanitizeText(clientId), sanitizeText(expedienteId)],
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
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, sanitizeText(num), sanitizeText(contacto), fecha || null, sanitizeAmount(total), sanitizeText(estado), sanitizeText(area), sanitizeText(responsable), Boolean(iguala), sanitizeText(clientId), sanitizeText(expedienteId)],
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

  try {
    const result = await pool.query(`DELETE FROM facturacion_presupuestos WHERE id = $1 AND user_id = $2 RETURNING num, contacto`, [id, userId]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Presupuesto no encontrado.' });
    await logActivityForReq(req, `Presupuesto eliminado: ${result.rows[0].num}`, 'FACTURACION_PRESUPUESTO', id, result.rows[0].contacto, 'DELETE');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: explainBillingError(error) });
  }
};
