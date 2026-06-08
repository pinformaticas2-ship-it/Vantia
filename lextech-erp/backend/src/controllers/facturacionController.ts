import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';
import { syncQuipuForUserInternal, pushFacturaToQuipuInternal } from './quipuController';

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
  userId: string,
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
      WHERE user_id = $1
        AND LOWER(num) = LOWER($2)
        AND LOWER(COALESCE(serie, '')) = LOWER($3)
        AND ($4::uuid IS NULL OR id <> $4::uuid)
      LIMIT 1`,
    [userId, cleanNum, cleanSerie, excludeId || null],
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
      }));
    } catch { /* quipu_invoices may not exist */ }

    const todasFacturas = [...facturas.rows, ...quipuRows];

    // Quipu synced contacts and bank accounts (loaded from local DB after sync)
    let quipuContactsRows: any[] = [];
    let quipuBankAccountsRows: any[] = [];
    try {
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
        presupuestos:      presupuestos.rows,
        clientes:          clientes.rows,
        expedientes:       expedientes.rows,
        quipuContacts:     quipuContactsRows,
        quipuBankAccounts: quipuBankAccountsRows,
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
    await ensureFacturaNumberAvailable(userId, num, serie);
    const result = await pool.query(
      `INSERT INTO facturacion_facturas
         (user_id, created_by, num, contacto, fecha, vencimiento, total, estado, area, responsable, forma_pago, serie, tipo_cliente, client_id, expediente_id, concepto, notas, base_unitaria, cantidad, descuento_pct, iva_pct, irpf_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
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
      ],
    );
    await logActivityForReq(req, `Factura creada: ${sanitizeText(num)}`, 'FACTURACION_FACTURA', result.rows[0].id, sanitizeText(contacto) || undefined, 'CREATE');

    // Auto-push to Quipu in background if connected
    const newId = result.rows[0].id;
    pool.query(`SELECT 1 FROM quipu_settings WHERE user_id=$1 LIMIT 1`, [userId]).then(qs => {
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
  const {
    num, contacto, fecha, vencimiento, total, estado, area, responsable,
    formaPago, serie, tipoCliente, clientId, expedienteId, concepto, notas,
    baseUnitaria, cantidad, descuentoPct, ivaPct, irpfPct,
  } = req.body;

  try {
    await ensureFacturaNumberAvailable(userId, num, serie, id);
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
  if (!sanitizeText(clientId)) {
    return res.status(400).json({ success: false, error: 'Selecciona un cliente del despacho.' });
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

// ── Cuentas bancarias manuales ────────────────────────────────
export const listBankAccounts = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  try {
    const result = await pool.query(
      `SELECT * FROM billing_bank_accounts WHERE user_id=$1 ORDER BY name ASC`, [userId]);
    res.json({ success: true, data: result.rows });
  } catch (e: any) { res.status(500).json({ success: false, error: e?.message }); }
};

export const createBankAccount = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const { name, bank_name, iban, balance, currency, notes } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'El nombre es obligatorio.' });
  try {
    const r = await pool.query(
      `INSERT INTO billing_bank_accounts (user_id,name,bank_name,iban,balance,currency,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [userId, name, bank_name||null, iban||null, Number(balance||0), currency||'EUR', notes||null]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e: any) { res.status(500).json({ success: false, error: e?.message }); }
};

export const updateBankAccount = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const { name, bank_name, iban, balance, currency, notes } = req.body;
  try {
    const r = await pool.query(
      `UPDATE billing_bank_accounts SET name=$3,bank_name=$4,iban=$5,balance=$6,currency=$7,notes=$8,updated_at=NOW()
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [id, userId, name, bank_name||null, iban||null, Number(balance||0), currency||'EUR', notes||null]);
    if (!r.rowCount) return res.status(404).json({ success: false, error: 'Cuenta no encontrada.' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e: any) { res.status(500).json({ success: false, error: e?.message }); }
};

export const deleteBankAccount = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  const { id } = req.params;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  try {
    await pool.query(`DELETE FROM billing_bank_accounts WHERE id=$1 AND user_id=$2`, [id, userId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ success: false, error: e?.message }); }
};
