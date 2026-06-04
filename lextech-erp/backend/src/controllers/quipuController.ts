import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';
import {
  fetchQuipuBootstrap,
  quipuOwnerFetch,
  fetchQuipuPaginatedList,
  requestQuipuToken,
  summarizeQuipuBootstrap,
} from '../services/quipuService';

const sanitizeText = (value: any) => {
  const text = String(value ?? '').trim();
  return text || null;
};

function buildQuipuFilingNumber(num: any, serie?: any) {
  const cleanNum = sanitizeText(num);
  const cleanSerie = sanitizeText(serie);
  if (!cleanNum) return null;
  return cleanSerie && !cleanNum.startsWith(`${cleanSerie}-`)
    ? `${cleanSerie}-${cleanNum}`
    : cleanNum;
}

function normalizeCountry(country: any) {
  const cleanCountry = sanitizeText(country) || 'España';
  const lowerCountry = cleanCountry.toLowerCase();
  const countryCode = lowerCountry === 'españa' || lowerCountry === 'espana' || lowerCountry === 'spain'
    ? 'ES'
    : undefined;
  return { country: cleanCountry, countryCode };
}

function mapQuipuPaymentMethod(paymentMethod: any) {
  const cleanPaymentMethod = String(paymentMethod || '').trim().toLowerCase();
  if (cleanPaymentMethod === 'tarjeta') return 'credit_card';
  if (cleanPaymentMethod === 'efectivo') return 'cash';
  if (cleanPaymentMethod === 'domiciliacion') return 'direct_debit';
  if (cleanPaymentMethod === 'bizum') return 'other';
  return 'bank_transfer';
}

function buildQuipuInvoiceItems(factura: any) {
  const totalAmount = Number(factura?.total || 0);
  const concept = sanitizeText(factura?.contacto)
    ? `Servicios jurídicos ${sanitizeText(factura?.contacto)}`
    : 'Servicios profesionales';
  const vatPercent = 21.0;
  const retentionPercent = 0.0;
  const baseAmount = totalAmount > 0 ? Number((totalAmount / (1 + vatPercent / 100)).toFixed(2)) : 0;

  return {
    totalAmount: Number(totalAmount.toFixed(2)),
    relationshipItems: [
      {
        type: 'items',
        attributes: {
          concept,
          unitary_amount: baseAmount.toFixed(2),
          quantity: 1,
          vat_percent: vatPercent,
          retention_percent: retentionPercent,
        },
      },
    ],
  };
}

function extractQuipuInvoiceTotal(invoice: any) {
  return Number(invoice?.data?.attributes?.total_amount || invoice?.data?.attributes?.total || invoice?.data?.total_amount || invoice?.data?.total || 0);
}

function buildQuipuInvoiceAttributes(factura: any, options?: { mode?: 'hybrid' }) {
  const issueDate = factura?.fecha ? String(factura.fecha).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const filingNumber = buildQuipuFilingNumber(factura?.num, factura?.serie);
  const mode = options?.mode || 'hybrid';
  const dueDate = factura?.vencimiento ? String(factura.vencimiento).slice(0, 10) : undefined;

  const attributes: any = {
    kind: 'income',
    issue_date: issueDate,
    ...(filingNumber ? { filing_number: filingNumber } : {}),
    ...(dueDate ? { due_dates: [dueDate] } : {}),
    subject: sanitizeText(factura?.contacto) ? `Factura ${filingNumber || factura?.num} · ${factura.contacto}` : `Factura ${filingNumber || factura?.num || ''}`.trim(),
    payment_method: mapQuipuPaymentMethod(factura?.forma_pago),
  };

  if (mode === 'hybrid') {
    attributes.total_amount = Number(factura?.total || 0).toFixed(2);
  }

  return attributes;
}

function buildQuipuInvoiceRelationships(
  factura: any,
  contactQuipuId: string,
  numberingSeriesId?: string | null,
) {
  const issueDate = factura?.fecha ? String(factura.fecha).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const filingNumber = buildQuipuFilingNumber(factura?.num, factura?.serie);
  const invoiceItems = buildQuipuInvoiceItems(factura);

  return {
    payment_method: mapQuipuPaymentMethod(factura?.forma_pago),
    issue_date: issueDate,
    due_date: factura?.vencimiento ? String(factura.vencimiento).slice(0, 10) : undefined,
    subject: sanitizeText(factura?.contacto) ? `Factura ${filingNumber || factura?.num} · ${factura.contacto}` : `Factura ${filingNumber || factura?.num || ''}`.trim(),
    filing_number: filingNumber || undefined,
    contact_id: contactQuipuId || undefined,
    contactID: contactQuipuId || undefined,
    numbering_series_id: numberingSeriesId || undefined,
    numberingSeriesID: numberingSeriesId || undefined,
    items: invoiceItems.relationshipItems,
  };
}

function buildQuipuInvoiceManualRelationships(
  factura: any,
  contactQuipuId?: string | null,
  numberingSeriesId?: string | null,
) {
  const invoiceItems = buildQuipuInvoiceItems(factura);
  const relationships: any = {
    items: {
      data: invoiceItems.relationshipItems,
    },
  };

  if (contactQuipuId) {
    relationships.contact = { data: { id: contactQuipuId, type: 'contacts' } };
  }
  if (numberingSeriesId) {
    relationships.numeration = { data: { id: numberingSeriesId, type: 'numbering_series' } };
  }

  return relationships;
}

function summarizeQuipuInvoiceResponse(invoice: any) {
  const attrs = invoice?.data?.attributes || {};
  return {
    id: invoice?.data?.id || null,
    status: attrs?.status || null,
    total_amount: attrs?.total_amount ?? invoice?.data?.total_amount ?? null,
    total: attrs?.total ?? invoice?.data?.total ?? null,
    subject: attrs?.subject || null,
    items_count:
      Array.isArray(attrs?.items) ? attrs.items.length :
      Array.isArray(invoice?.included) ? invoice.included.filter((item: any) => item?.type === 'book_entry_items').length :
      null,
    raw_attributes: attrs,
  };
}

function formatQuipuInvoiceAttempt(label: string, invoice: any) {
  const summary = summarizeQuipuInvoiceResponse(invoice);
  return `${label}[id=${summary.id || 'n/a'}, total=${summary.total_amount ?? summary.total ?? 'n/a'}, items=${summary.items_count ?? 'n/a'}, status=${summary.status || 'n/a'}]`;
}

async function fetchQuipuInvoiceDetail(settings: any, accessToken: string, quipuId: string) {
  if (!quipuId) return null;
  try {
    return await quipuOwnerFetch<any>(settings, `/invoices/${quipuId}?include=items,contact,numbering_series`, undefined, accessToken);
  } catch (error: any) {
    console.warn(`[QuipuPush] failed to fetch detail for quipuId=${quipuId}: ${error?.message}`);
    return null;
  }
}

async function resolveQuipuContactId(
  userId: string,
  settings: any,
  accessToken: string,
  contactName: any,
  options?: {
    nifCif?: any;
    email?: any;
    country?: any;
    address?: any;
    town?: any;
    zipCode?: any;
    phone?: any;
  },
): Promise<string> {
  const cleanContactName = sanitizeText(contactName);
  const cleanTaxId = sanitizeText(options?.nifCif);
  const cleanEmail = sanitizeText(options?.email);
  const { country, countryCode } = normalizeCountry(options?.country);
  const cleanAddress = sanitizeText(options?.address);
  const cleanTown = sanitizeText(options?.town);
  const cleanZipCode = sanitizeText(options?.zipCode);
  const cleanPhone = sanitizeText(options?.phone);

  if (!cleanContactName) {
    throw new Error('La factura no tiene cliente informado para crear el contacto en Quipu.');
  }

  const localContact = await pool.query(
    `SELECT external_id
       FROM quipu_contacts
      WHERE user_id = $1
        AND (
          LOWER(contact_name) = LOWER($2)
          OR ($3::text IS NOT NULL AND tax_id = $3::text)
        )
      ORDER BY CASE WHEN LOWER(contact_name) = LOWER($2) THEN 0 ELSE 1 END
      LIMIT 1`,
    [userId, cleanContactName, cleanTaxId],
  );
  if (localContact.rows.length > 0) {
    return String(localContact.rows[0].external_id || '');
  }

  try {
    const createdContact = await quipuOwnerFetch<any>(settings, '/contacts', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'contacts',
          attributes: {
            kind: 'client',
            name: cleanContactName,
            ...(cleanTaxId ? { tax_id: cleanTaxId } : {}),
            ...(cleanEmail ? { email: cleanEmail } : {}),
            ...(cleanPhone ? { phone: cleanPhone } : {}),
            ...(cleanAddress ? { address: cleanAddress } : {}),
            ...(cleanTown ? { town: cleanTown } : {}),
            ...(cleanZipCode ? { zip_code: cleanZipCode } : {}),
            country,
            ...(countryCode ? { country_code: countryCode } : {}),
          },
        },
      }),
    }, accessToken);

    const quipuContactId = String(createdContact?.data?.id || '').trim();
    if (!quipuContactId) {
      throw new Error('Quipu no devolvió el identificador del contacto.');
    }

    await pool.query(
      `INSERT INTO quipu_contacts
         (user_id, quipu_setting_id, external_id, external_type, kind, contact_name, tax_id, email, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, external_id) DO UPDATE
       SET external_type = EXCLUDED.external_type,
           kind = EXCLUDED.kind,
           contact_name = EXCLUDED.contact_name,
           tax_id = EXCLUDED.tax_id,
           email = EXCLUDED.email,
           raw_payload = EXCLUDED.raw_payload,
           updated_at = NOW()`,
      [
        userId,
        settings.id || null,
        quipuContactId,
        String(createdContact?.data?.type || 'contacts'),
        'client',
        cleanContactName,
        cleanTaxId,
        cleanEmail,
        JSON.stringify(createdContact?.data || {}),
      ],
    );

    return quipuContactId;
  } catch (error: any) {
    throw new Error(`No se pudo crear o localizar el contacto de Quipu para "${cleanContactName}": ${error?.message || 'error desconocido'}`);
  }
}

async function getStoredQuipuSettings(userId: string) {
  const result = await pool.query(`SELECT * FROM quipu_settings WHERE user_id = $1 LIMIT 1`, [userId]);
  return result.rows[0] || null;
}

async function getPreferredQuipuNumerationId(userId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT external_id
       FROM quipu_numbering_series
      WHERE user_id = $1
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(name, '')) LIKE '%documentos existentes%' THEN 0
          WHEN LOWER(COALESCE(name, '')) LIKE '%documento existente%' THEN 1
          WHEN LOWER(COALESCE(name, '')) LIKE '%historic%' THEN 2
          WHEN LOWER(COALESCE(raw_payload::text, '')) LIKE '%documentos existentes%' THEN 3
          WHEN LOWER(COALESCE(raw_payload::text, '')) LIKE '%documento existente%' THEN 4
          WHEN LOWER(COALESCE(raw_payload::text, '')) LIKE '%historic%' THEN 5
          ELSE 10
        END,
        id ASC
      LIMIT 1`,
    [userId],
  );
  return result.rows.length ? String(result.rows[0].external_id || '') : null;
}

async function summarizeQuipuNumerations(userId: string): Promise<string> {
  const result = await pool.query(
    `SELECT external_id, COALESCE(name, '') AS name, COALESCE(prefix, '') AS prefix
       FROM quipu_numbering_series
      WHERE user_id = $1
      ORDER BY name ASC, prefix ASC, external_id ASC
      LIMIT 12`,
    [userId],
  );
  if (!result.rows.length) return 'Sin series sincronizadas en local';
  return result.rows
    .map((row: any) => {
      const name = String(row.name || '').trim() || 'Sin nombre';
      const prefix = String(row.prefix || '').trim();
      const externalId = String(row.external_id || '').trim();
      return `${name}${prefix ? ` [${prefix}]` : ''}${externalId ? ` {${externalId}}` : ''}`;
    })
    .join(' | ');
}

async function diagnoseQuipuEndpoints(settings: any, token?: string | null) {
  const checks = [
    { key: 'contacts', path: '/contacts?page[size]=1' },
    { key: 'invoices', path: '/invoices?page[size]=1&sort=-issued_at' },
    { key: 'company', path: '/company' },
    { key: 'numbering_series', path: '/numbering_series?page[size]=1' },
  ];

  const results: Array<{ key: string; ok: boolean; detail: string }> = [];

  for (const check of checks) {
    try {
      const response = await quipuOwnerFetch<any>(settings, check.path, undefined, token || undefined);
      const total =
        response?.meta?.total_entries ??
        response?.meta?.pagination_info?.total_results ??
        (Array.isArray(response?.data) ? response.data.length : response?.data?.id || 'ok');
      results.push({ key: check.key, ok: true, detail: String(total) });
    } catch (error: any) {
      results.push({ key: check.key, ok: false, detail: String(error?.message || 'error') });
    }
  }

  return results;
}

function summarizeQuipuEndpointDiagnosis(results: Array<{ key: string; ok: boolean; detail: string }>): string {
  return results.map((item) => `${item.key}=${item.ok ? 'ok' : 'fail'}(${item.detail})`).join(' | ');
}

function normalizeOwnerSlugInput(value: any): string {
  const raw = sanitizeText(value);
  if (!raw) return '';
  const withoutQuery = raw.split('?')[0].split('#')[0].trim();
  const fromUrl = withoutQuery.match(/^https?:\/\/[^/]+\/([^/]+)/i);
  const candidate = fromUrl ? fromUrl[1] : withoutQuery;
  return candidate.replace(/^\/+|\/+$/g, '');
}

function mapQuipuStatus(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'cobrada';
  if (s === 'overdue') return 'vencida';
  if (s === 'sent' || s === 'issued') return 'enviada';
  return 'pendiente';
}

async function ensureQuipuBankAccountsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quipu_bank_accounts (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           VARCHAR(150) NOT NULL,
      quipu_setting_id  UUID REFERENCES quipu_settings(id) ON DELETE CASCADE,
      external_id       VARCHAR(255) NOT NULL,
      external_type     VARCHAR(80),
      name              VARCHAR(255),
      iban              VARCHAR(100),
      current_balance   NUMERIC(14,2) NOT NULL DEFAULT 0,
      bank_name         VARCHAR(255),
      currency_code     VARCHAR(10) DEFAULT 'EUR',
      raw_payload       JSONB NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, external_id)
    )
  `);
}

async function ensureQuipuSyncTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quipu_contacts (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           VARCHAR(150) NOT NULL,
      quipu_setting_id  UUID REFERENCES quipu_settings(id) ON DELETE CASCADE,
      external_id       VARCHAR(255) NOT NULL,
      external_type     VARCHAR(80),
      kind              VARCHAR(50),
      contact_name      VARCHAR(255),
      tax_id            VARCHAR(100),
      email             VARCHAR(255),
      raw_payload       JSONB NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, external_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quipu_invoices (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           VARCHAR(150) NOT NULL,
      quipu_setting_id  UUID REFERENCES quipu_settings(id) ON DELETE CASCADE,
      external_id       VARCHAR(255) NOT NULL,
      external_type     VARCHAR(80),
      contact_name      VARCHAR(255),
      number            VARCHAR(120),
      status            VARCHAR(60),
      issue_date        DATE,
      due_date          DATE,
      total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      raw_payload       JSONB NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, external_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quipu_numbering_series (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           VARCHAR(150) NOT NULL,
      quipu_setting_id  UUID REFERENCES quipu_settings(id) ON DELETE CASCADE,
      external_id       VARCHAR(255) NOT NULL,
      external_type     VARCHAR(80),
      name              VARCHAR(255),
      prefix            VARCHAR(80),
      next_number       INTEGER NOT NULL DEFAULT 0,
      raw_payload       JSONB NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, external_id)
    )
  `);
}

async function persistQuipuBootstrap(userId: string, settingId: string, bootstrap: {
  contacts: any[];
  invoices: any[];
  receivedInvoices?: any[];
  numberingSeries: any[];
  bankAccounts?: any[];
}) {
  await ensureQuipuSyncTables();
  await ensureQuipuBankAccountsTable();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM quipu_contacts WHERE user_id = $1`, [userId]);
    for (const item of bootstrap.contacts) {
      const extId = String(item?.id || '');
      if (!extId) continue;
      await client.query(
        `INSERT INTO quipu_contacts
           (user_id, quipu_setting_id, external_id, external_type, kind, contact_name, tax_id, email, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (user_id, external_id) DO UPDATE SET
           kind=EXCLUDED.kind, contact_name=EXCLUDED.contact_name,
           tax_id=EXCLUDED.tax_id, email=EXCLUDED.email,
           raw_payload=EXCLUDED.raw_payload, updated_at=NOW()`,
        [
          userId, settingId, extId,
          String(item?.type || 'contacts'),
          String(item?.attributes?.kind || 'client'),
          String(item?.attributes?.name || item?.attributes?.trade_name || ''),
          String(item?.attributes?.tax_id || item?.attributes?.vat_number || ''),
          String(item?.attributes?.email || ''),
          JSON.stringify(item),
        ],
      );
    }

    await client.query(`DELETE FROM quipu_invoices WHERE user_id = $1`, [userId]);
    for (const item of bootstrap.invoices) {
      const extId = String(item?.id || '');
      if (!extId) continue;
      await client.query(
        `INSERT INTO quipu_invoices
           (user_id, quipu_setting_id, external_id, external_type, contact_name, number, status, issue_date, due_date, total_amount, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id, external_id) DO UPDATE SET
           contact_name=EXCLUDED.contact_name, number=EXCLUDED.number,
           status=EXCLUDED.status, issue_date=EXCLUDED.issue_date,
           due_date=EXCLUDED.due_date, total_amount=EXCLUDED.total_amount,
           raw_payload=EXCLUDED.raw_payload, updated_at=NOW()`,
        [
          userId, settingId, extId,
          String(item?.type || 'invoices'),
          String(item?.attributes?.contact_name || item?.attributes?.recipient_name || ''),
          String(item?.attributes?.number || item?.attributes?.serial_number || ''),
          String(item?.attributes?.status || ''),
          item?.attributes?.issue_date || item?.attributes?.issued_at || null,
          item?.attributes?.due_date || null,
          Number(item?.attributes?.total_amount || item?.attributes?.total || 0),
          JSON.stringify(item),
        ],
      );
    }

    // Also persist received invoices (gastos) in quipu_invoices with type 'received_invoices'
    for (const item of (bootstrap.receivedInvoices || [])) {
      const extId = `recv_${String(item?.id || '')}`;
      if (!extId || extId === 'recv_') continue;
      await client.query(
        `INSERT INTO quipu_invoices
           (user_id, quipu_setting_id, external_id, external_type, contact_name, number, status, issue_date, due_date, total_amount, raw_payload)
         VALUES ($1,$2,$3,'received_invoices',$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (user_id, external_id) DO UPDATE SET
           contact_name=EXCLUDED.contact_name, number=EXCLUDED.number,
           status=EXCLUDED.status, issue_date=EXCLUDED.issue_date,
           due_date=EXCLUDED.due_date, total_amount=EXCLUDED.total_amount,
           raw_payload=EXCLUDED.raw_payload, updated_at=NOW()`,
        [
          userId, settingId, extId,
          String(item?.attributes?.contact_name || item?.attributes?.recipient_name || ''),
          String(item?.attributes?.number || item?.attributes?.serial_number || ''),
          String(item?.attributes?.status || ''),
          item?.attributes?.issue_date || item?.attributes?.issued_at || null,
          item?.attributes?.due_date || null,
          Number(item?.attributes?.total_amount || item?.attributes?.total || 0),
          JSON.stringify(item),
        ],
      );
    }

    await client.query(`DELETE FROM quipu_numbering_series WHERE user_id = $1`, [userId]);
    for (const item of bootstrap.numberingSeries) {
      const extId = String(item?.id || '');
      if (!extId) continue;
      await client.query(
        `INSERT INTO quipu_numbering_series
           (user_id, quipu_setting_id, external_id, external_type, name, prefix, next_number, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id, external_id) DO UPDATE SET
           name=EXCLUDED.name, prefix=EXCLUDED.prefix,
           next_number=EXCLUDED.next_number, raw_payload=EXCLUDED.raw_payload,
           updated_at=NOW()`,
        [
          userId, settingId, extId,
          String(item?.type || 'numbering_series'),
          String(item?.attributes?.name || ''),
          String(item?.attributes?.prefix || ''),
          Number(item?.attributes?.next_number || 0),
          JSON.stringify(item),
        ],
      );
    }

    // Bank accounts (optional — not all Quipu plans expose this)
    if (bootstrap.bankAccounts && bootstrap.bankAccounts.length > 0) {
      await client.query(`DELETE FROM quipu_bank_accounts WHERE user_id = $1`, [userId]);
      for (const item of bootstrap.bankAccounts) {
        const balance = Number(
          item?.attributes?.current_balance ?? item?.attributes?.balance ?? 0
        );
        await client.query(
          `INSERT INTO quipu_bank_accounts
             (user_id, quipu_setting_id, external_id, external_type, name, iban, current_balance, bank_name, currency_code, raw_payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (user_id, external_id) DO UPDATE
             SET name = EXCLUDED.name, iban = EXCLUDED.iban,
                 current_balance = EXCLUDED.current_balance,
                 bank_name = EXCLUDED.bank_name,
                 currency_code = EXCLUDED.currency_code,
                 raw_payload = EXCLUDED.raw_payload,
                 updated_at = NOW()`,
          [
            userId, settingId,
            String(item?.id || ''),
            String(item?.type || 'bank_accounts'),
            String(item?.attributes?.name || ''),
            String(item?.attributes?.iban || item?.attributes?.account_number || ''),
            balance,
            String(item?.attributes?.entity_bank_name || item?.attributes?.bank_name || ''),
            String(item?.attributes?.currency_code || item?.attributes?.currency || 'EUR'),
            JSON.stringify(item),
          ],
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Ensure quipu_id columns + unique indexes on billing tables ───────────────
async function ensureFacturasQuipuColumn() {
  // facturacion_facturas
  try { await pool.query(`ALTER TABLE facturacion_facturas ADD COLUMN IF NOT EXISTS quipu_id VARCHAR(255)`); }
  catch (e: any) { console.warn('[Quipu] ADD COLUMN facturas.quipu_id:', e?.message); }
  try {
    await pool.query(`
      DELETE FROM facturacion_facturas WHERE quipu_id IS NOT NULL
        AND id NOT IN (
          SELECT DISTINCT ON (user_id, quipu_id) id FROM facturacion_facturas
          WHERE quipu_id IS NOT NULL ORDER BY user_id, quipu_id, created_at DESC NULLS LAST
        )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_facturacion_facturas_quipu_id
      ON facturacion_facturas (user_id, quipu_id) WHERE quipu_id IS NOT NULL`);
  } catch (e: any) { console.warn('[Quipu] INDEX facturas.quipu_id:', e?.message); }

  // facturacion_gastos
  try { await pool.query(`ALTER TABLE facturacion_gastos ADD COLUMN IF NOT EXISTS quipu_id VARCHAR(255)`); }
  catch (e: any) { console.warn('[Quipu] ADD COLUMN gastos.quipu_id:', e?.message); }
  try {
    await pool.query(`
      DELETE FROM facturacion_gastos WHERE quipu_id IS NOT NULL
        AND id NOT IN (
          SELECT DISTINCT ON (user_id, quipu_id) id FROM facturacion_gastos
          WHERE quipu_id IS NOT NULL ORDER BY user_id, quipu_id, created_at DESC NULLS LAST
        )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_facturacion_gastos_quipu_id
      ON facturacion_gastos (user_id, quipu_id) WHERE quipu_id IS NOT NULL`);
  } catch (e: any) { console.warn('[Quipu] INDEX gastos.quipu_id:', e?.message); }
}

// ── Internal sync (no HTTP context) — usable from auto-sync and cron ─────────
export async function syncQuipuForUserInternal(userId: string): Promise<{
  imported: number; updated: number; errors: string[]; summary: any;
}> {
  const settings = await getStoredQuipuSettings(userId);
  if (!settings) throw new Error('No Quipu settings for user');

  await ensureFacturasQuipuColumn();
  const bootstrap = await fetchQuipuBootstrap(settings);
  const summary = summarizeQuipuBootstrap(bootstrap);
  await persistQuipuBootstrap(userId, settings.id, bootstrap);

  let imported = 0; let updated = 0;
  let importedGastos = 0; let updatedGastos = 0;
  const errors: string[] = [];

  // ── Income invoices → facturacion_facturas ────────────────────
  for (const item of bootstrap.invoices) {
    const quipuId = String(item?.id || '').trim();
    if (!quipuId) continue;
    const num = String(item?.attributes?.number || item?.attributes?.serial_number || quipuId).trim();
    const contacto = String(item?.attributes?.contact_name || item?.attributes?.recipient_name || 'Quipu').trim();
    const fecha = item?.attributes?.issue_date || item?.attributes?.issued_at || new Date().toISOString().slice(0, 10);
    const vencimiento = item?.attributes?.due_date || null;
    const total = Number(item?.attributes?.total_amount || item?.attributes?.total || 0);
    const estado = mapQuipuStatus(item?.attributes?.status || '');
    try {
      const r = await pool.query(
        `INSERT INTO facturacion_facturas
           (user_id, created_by, num, contacto, fecha, vencimiento, total, estado,
            area, responsable, forma_pago, serie, tipo_cliente, quipu_id)
         VALUES ($1,'Quipu Sync',$2,$3,$4,$5,$6,$7,'procesal','Quipu','transferencia','QUIPU','empresa',$8)
         ON CONFLICT (user_id, quipu_id) WHERE quipu_id IS NOT NULL
         DO UPDATE SET num=$2, contacto=$3, fecha=$4, vencimiento=$5, total=$6, estado=$7, updated_at=NOW()
         RETURNING (xmax = 0) AS inserted`,
        [userId, num, contacto, fecha, vencimiento, total, estado, quipuId],
      );
      if (r.rows[0]?.inserted) imported++; else updated++;
    } catch (e: any) {
      errors.push(`factura ${quipuId}: ${e?.message?.slice(0, 80)}`);
    }
  }

  // ── Received invoices (Gastos) → facturacion_gastos ──────────
  for (const item of (bootstrap.receivedInvoices || [])) {
    const quipuId = String(item?.id || '').trim();
    if (!quipuId) continue;
    const num = String(item?.attributes?.number || item?.attributes?.serial_number || quipuId).trim();
    const proveedor = String(item?.attributes?.contact_name || item?.attributes?.recipient_name || 'Proveedor').trim();
    const fecha = item?.attributes?.issue_date || item?.attributes?.issued_at || new Date().toISOString().slice(0, 10);
    const total = Number(item?.attributes?.total_amount || item?.attributes?.total || 0);
    const estado = item?.attributes?.status === 'paid' ? 'contabilizado' : 'pendiente';
    const cat = String(item?.attributes?.accounting_category || item?.attributes?.category || 'Quipu').trim();
    try {
      const r = await pool.query(
        `INSERT INTO facturacion_gastos
           (user_id, created_by, num, proveedor, fecha, total, categoria, estado,
            area, responsable, deducible, quipu_id)
         VALUES ($1,'Quipu Sync',$2,$3,$4,$5,$6,$7,'procesal','Quipu',true,$8)
         ON CONFLICT (user_id, quipu_id) WHERE quipu_id IS NOT NULL
         DO UPDATE SET proveedor=$3, fecha=$4, total=$5, estado=$7, updated_at=NOW()
         RETURNING (xmax = 0) AS inserted`,
        [userId, num, proveedor, fecha, total, cat, estado, quipuId],
      );
      if (r.rows[0]?.inserted) importedGastos++; else updatedGastos++;
    } catch (e: any) {
      errors.push(`gasto ${quipuId}: ${e?.message?.slice(0, 80)}`);
    }
  }

  await pool.query(
    `UPDATE quipu_settings SET last_sync_at=NOW(), sync_summary=$2, updated_at=NOW() WHERE user_id=$1`,
    [userId, JSON.stringify({
      ...summary,
      importedToFacturacion: imported, updatedInFacturacion: updated,
      importedGastos, updatedGastos,
      syncErrors: errors.length,
    })],
  );

  if (errors.length) console.warn(`[QuipuSync] user=${userId} errors=${errors.length}`, errors.slice(0, 3));
  console.log(`[QuipuSync] user=${userId} facturas=${imported}+${updated} gastos=${importedGastos}+${updatedGastos} errors=${errors.length}`);
  return { imported, updated, errors, summary };
}

// ── Sync all users with Quipu connected (for periodic job) ────────────────────
export async function syncAllQuipuUsers(): Promise<void> {
  try {
    const result = await pool.query(`SELECT DISTINCT user_id FROM quipu_settings`);
    for (const row of result.rows) {
      try {
        await syncQuipuForUserInternal(row.user_id);
      } catch (e: any) {
        console.error(`[QuipuAutoSync] user=${row.user_id}:`, e?.message);
      }
    }
  } catch (e: any) {
    console.error('[QuipuAutoSync] failed to list users:', e?.message);
  }
}

// ── Internal push factura to Quipu (no HTTP context) ─────────────────────────
export async function pushFacturaToQuipuInternal(userId: string, facturaId: string): Promise<string | null> {
  const settings = await getStoredQuipuSettings(userId);
  if (!settings) return null;

  const res = await pool.query(
    `SELECT ff.*, e.nif_cif, e.email, e.address_country, e.address_street, e.address_town, e.address_cp, e.phone_1, e.phone_mobile
     FROM facturacion_facturas ff
     LEFT JOIN entities e ON e.id = ff.client_id
     WHERE ff.id=$1 AND ff.user_id=$2`,
    [facturaId, userId],
  );
  if (!res.rows.length) return null;
  const f = res.rows[0];
  if (f.quipu_id) return f.quipu_id;

  const { accessToken } = await requestQuipuToken(settings);

  const contactQuipuId = await resolveQuipuContactId(userId, settings, accessToken, f.contacto, {
    nifCif: f.nif_cif,
    email: f.email,
    country: f.address_country,
    address: f.address_street,
    town: f.address_town,
    zipCode: f.address_cp,
    phone: f.phone_mobile || f.phone_1,
  });

  const attributes = buildQuipuInvoiceAttributes(f, { mode: 'hybrid' });
  const numberingSeriesId = await getPreferredQuipuNumerationId(userId);
  const relationships = buildQuipuInvoiceManualRelationships(f, contactQuipuId, numberingSeriesId);

  const payload = { data: { type: 'invoices', attributes, ...(Object.keys(relationships).length ? { relationships } : {}) } };
  console.log(`[QuipuPush] manual payload factura=${facturaId}: ${JSON.stringify(payload)}`);
  const created = await quipuOwnerFetch<any>(settings, '/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, accessToken);

  const quipuId = String(created?.data?.id || '');
  if (quipuId) {
    try {
      let detail = await fetchQuipuInvoiceDetail(settings, accessToken, quipuId);
      let total = extractQuipuInvoiceTotal(detail);

      if (total <= 0) {
        const patchPayload = {
          data: {
            type: 'invoices',
            id: quipuId,
            attributes: buildQuipuInvoiceAttributes(f, { mode: 'hybrid' }),
            ...(Object.keys(relationships).length ? { relationships } : {}),
          },
        };
        console.log(`[QuipuPush] best-effort patch manual factura=${facturaId}: ${JSON.stringify(patchPayload)}`);
        await quipuOwnerFetch<any>(settings, `/invoices/${quipuId}`, {
          method: 'PATCH',
          body: JSON.stringify(patchPayload),
        }, accessToken);
        detail = await fetchQuipuInvoiceDetail(settings, accessToken, quipuId);
        total = extractQuipuInvoiceTotal(detail);
      }

      console.log(`[QuipuPush] post-create total factura=${facturaId} quipuId=${quipuId} total=${total}`);
    } catch (patchError: any) {
      console.warn(`[QuipuPush] best-effort amount patch failed factura=${facturaId} quipuId=${quipuId}: ${patchError?.message}`);
    }

    await pool.query(`UPDATE facturacion_facturas SET quipu_id=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3`, [quipuId, facturaId, userId]);
    console.log(`[QuipuPush] factura=${facturaId} quipuId=${quipuId}`);
  }
  return quipuId || null;
}

// ── Diagnostic endpoint: tests each step without doing a full sync ────────────
export const diagnoseQuipu = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  const steps: { step: string; ok: boolean; detail: string }[] = [];

  let settings: any = null;
  try {
    settings = await getStoredQuipuSettings(userId);
    steps.push({ step: 'settings', ok: !!settings, detail: settings ? `app_id=${String(settings.app_id || '').slice(0, 8)}… owner_slug=${settings.owner_slug} base_url=${settings.base_url}` : 'No hay configuración de Quipu' });
  } catch (e: any) {
    steps.push({ step: 'settings', ok: false, detail: e?.message });
    return res.json({ success: false, steps });
  }
  if (!settings) return res.json({ success: false, steps });

  let token: string | null = null;
  try {
    const t = await requestQuipuToken(settings);
    token = t.accessToken;
    steps.push({ step: 'auth', ok: true, detail: `Token OK (${token.length} chars, expires ${t.expiresAt.toISOString()})` });
  } catch (e: any) {
    steps.push({ step: 'auth', ok: false, detail: e?.message });
    return res.json({ success: false, steps });
  }

  try {
    const contacts = await quipuOwnerFetch<any>(settings, '/contacts?page[size]=1', undefined, token);
    const total = contacts?.meta?.total_entries ?? contacts?.data?.length ?? '?';
    steps.push({ step: 'contacts', ok: true, detail: `total_entries=${total}` });
  } catch (e: any) {
    steps.push({ step: 'contacts', ok: false, detail: e?.message });
  }

  try {
    const invoices = await quipuOwnerFetch<any>(settings, '/invoices?page[size]=1&sort=-issued_at', undefined, token);
    const total = invoices?.meta?.total_entries ?? invoices?.data?.length ?? '?';
    steps.push({ step: 'invoices', ok: true, detail: `total_entries=${total}` });
  } catch (e: any) {
    steps.push({ step: 'invoices', ok: false, detail: e?.message });
  }

  // Test bank accounts endpoint
  try {
    const ba = await quipuOwnerFetch<any>(settings, '/bank_accounts?page[size]=1', undefined, token);
    const total = ba?.meta?.total_entries ?? ba?.data?.length ?? '?';
    steps.push({ step: 'bank_accounts', ok: true, detail: `total_entries=${total}` });
  } catch (e: any) {
    const is404 = e?.message?.includes('404');
    steps.push({ step: 'bank_accounts', ok: false, detail: is404
      ? 'No disponible vía API (404). El módulo Tesorería/Bancos de Quipu no expone banco vía API en este plan.'
      : e?.message });
  }

  // Test received invoices (gastos) endpoint
  try {
    const ri = await quipuOwnerFetch<any>(settings, '/received_invoices?page[size]=1', undefined, token);
    const total = ri?.meta?.total_entries ?? ri?.data?.length ?? '?';
    steps.push({ step: 'received_invoices', ok: true, detail: `total_entries=${total}` });
  } catch (e: any) {
    steps.push({ step: 'received_invoices', ok: false, detail: e?.message });
  }

  try {
    const r = await pool.query(
      `SELECT COUNT(*) AS cnt FROM facturacion_facturas WHERE user_id=$1 AND quipu_id IS NOT NULL`, [userId],
    );
    const g = await pool.query(
      `SELECT COUNT(*) AS cnt FROM facturacion_gastos WHERE user_id=$1 AND quipu_id IS NOT NULL`, [userId],
    ).catch(() => ({ rows: [{ cnt: 'n/a' }] }));
    const ba = await pool.query(
      `SELECT COUNT(*) AS cnt FROM quipu_bank_accounts WHERE user_id=$1`, [userId],
    ).catch(() => ({ rows: [{ cnt: 'n/a' }] }));
    steps.push({ step: 'db_imported', ok: true, detail: `facturas=${r.rows[0].cnt} gastos=${g.rows[0].cnt} bank_accounts=${ba.rows[0].cnt}` });
  } catch (e: any) {
    steps.push({ step: 'db_imported', ok: false, detail: e?.message });
  }

  res.json({ success: true, steps });
};

export const getQuipuStatus = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const settings = await getStoredQuipuSettings(userId);
    if (!settings) {
      return res.json({ success: true, data: { connected: false } });
    }

    res.json({
      success: true,
      data: {
        connected: true,
        baseUrl: settings.base_url,
        ownerSlug: settings.owner_slug || null,
        lastSyncAt: settings.last_sync_at,
        syncSummary: settings.sync_summary || null,
        quipuCompany: settings.quipu_company || null,
        quipuEmail: settings.quipu_email || null,
        hasAccessToken: Boolean(settings.access_token),
        syncRunning: _syncRunning.has(userId),
        syncError: _syncLastError.get(userId) || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudo cargar el estado de Quipu.' });
  }
};

export const saveQuipuCredentials = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  const existingSettings = await getStoredQuipuSettings(userId);
  const appId = sanitizeText(req.body?.appId) || existingSettings?.app_id || '';
  const appSecret = sanitizeText(req.body?.appSecret) || existingSettings?.app_secret || '';
  const baseUrl = sanitizeText(req.body?.baseUrl) || 'https://getquipu.com';
  const ownerSlug = normalizeOwnerSlugInput(req.body?.ownerSlug);

  if (!appId || !appSecret || !ownerSlug) {
    return res.status(400).json({ success: false, error: 'App ID, App Secret y owner_slug son obligatorios. Si ya había conexión, puedes dejar App ID y App Secret vacíos, pero el owner_slug sí debe informarse.' });
  }

  try {
    const token = await requestQuipuToken({ app_id: appId, app_secret: appSecret, base_url: baseUrl, owner_slug: ownerSlug });
    const endpointDiagnosis = await diagnoseQuipuEndpoints({ app_id: appId, app_secret: appSecret, base_url: baseUrl, owner_slug: ownerSlug }, token.accessToken);
    const contactsOk = endpointDiagnosis.find((item) => item.key === 'contacts')?.ok;
    const companyOk = endpointDiagnosis.find((item) => item.key === 'company')?.ok;
    const invoicesOk = endpointDiagnosis.find((item) => item.key === 'invoices')?.ok;
    if (!invoicesOk && (contactsOk || companyOk)) {
      throw new Error(`La autenticacion con Quipu es valida, pero el recurso de facturas no responde para esta cuenta/configuracion. Diagnostico: ${summarizeQuipuEndpointDiagnosis(endpointDiagnosis)}`);
    }
    const userName = await resolveUserName(userId);
    const result = await pool.query(
      `INSERT INTO quipu_settings
         (user_id, app_id, app_secret, base_url, owner_slug, access_token, token_type, token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id) DO UPDATE
       SET app_id = EXCLUDED.app_id,
           app_secret = EXCLUDED.app_secret,
           base_url = EXCLUDED.base_url,
           owner_slug = EXCLUDED.owner_slug,
           access_token = EXCLUDED.access_token,
           token_type = EXCLUDED.token_type,
           token_expires_at = EXCLUDED.token_expires_at,
           updated_at = NOW()
       RETURNING *`,
      [userId, appId, appSecret, baseUrl, ownerSlug, token.accessToken, token.tokenType, token.expiresAt],
    );

    await logActivityForReq(req, 'Configuración Quipu guardada', 'QUIPU', result.rows[0].id, userName, 'UPDATE');

    res.json({
      success: true,
      data: {
        connected: true,
        baseUrl: result.rows[0].base_url,
        ownerSlug: result.rows[0].owner_slug,
        tokenExpiresAt: result.rows[0].token_expires_at,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'No se pudo validar la conexión con Quipu.' });
  }
};

export const disconnectQuipu = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    await pool.query(`DELETE FROM quipu_settings WHERE user_id = $1`, [userId]);
    await logActivityForReq(req, 'Conexión Quipu eliminada', 'QUIPU', undefined, undefined, 'DELETE');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudo desconectar Quipu.' });
  }
};

// Track in-progress syncs so the frontend can poll status
const _syncRunning = new Set<string>();
const _syncLastError = new Map<string, string>();

export function isQuipuSyncRunning(userId: string) { return _syncRunning.has(userId); }

export const syncQuipuBootstrap = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  try {
    const settings = await getStoredQuipuSettings(userId);
    if (!settings) return res.status(400).json({ success: false, error: 'Primero debes configurar Quipu.' });

    if (_syncRunning.has(userId)) {
      return res.json({ success: true, data: { running: true, message: 'Sincronización ya en curso' } });
    }

    // Return immediately — sync runs in background to avoid HTTP timeout
    res.json({ success: true, data: { running: true, message: 'Sincronización iniciada' } });

    _syncRunning.add(userId);
    _syncLastError.delete(userId);

    syncQuipuForUserInternal(userId)
      .then(({ imported, updated }) => {
        console.log(`[Quipu] sync done user=${userId} imported=${imported} updated=${updated}`);
        logActivityForReq(req, 'Sincronización Quipu ejecutada', 'QUIPU', settings.id, undefined, 'UPDATE').catch(() => {});
      })
      .catch((e: any) => {
        console.error(`[Quipu] sync error user=${userId}:`, e?.message);
        _syncLastError.set(userId, e?.message || 'Error desconocido');
      })
      .finally(() => { _syncRunning.delete(userId); });

  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'No se pudo iniciar la sincronización.' });
  }
};

// ─────────────────────────────────────────────────────────────────
// SYNCED DATA (from local DB, no live API call needed)
// ─────────────────────────────────────────────────────────────────

export const getSyncedContacts = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  try {
    const result = await pool.query(
      `SELECT external_id AS id, kind, contact_name AS name, tax_id, email,
              COALESCE(raw_payload->>'phone', raw_payload->'attributes'->>'phone') AS phone,
              COALESCE(raw_payload->>'address', raw_payload->'attributes'->>'address') AS address,
              COALESCE(raw_payload->>'town', raw_payload->'attributes'->>'town') AS town,
              COALESCE(raw_payload->>'zip_code', raw_payload->'attributes'->>'zip_code') AS zip_code,
              COALESCE(raw_payload->>'country', raw_payload->'attributes'->>'country') AS country,
              COALESCE(raw_payload->>'country_code', raw_payload->'attributes'->>'country_code') AS country_code
       FROM quipu_contacts WHERE user_id = $1 ORDER BY contact_name ASC`,
      [userId],
    );
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al leer contactos sincronizados.' });
  }
};

export const getSyncedBankAccounts = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  try {
    await ensureQuipuBankAccountsTable();
    const result = await pool.query(
      `SELECT external_id AS id, name, iban, current_balance AS balance,
              bank_name, currency_code, updated_at
       FROM quipu_bank_accounts WHERE user_id = $1 ORDER BY name ASC`,
      [userId],
    );
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.json({ success: true, data: [] }); // table may not exist yet
  }
};

// ─────────────────────────────────────────────────────────────────
// LIVE PROXY helpers
// ─────────────────────────────────────────────────────────────────

async function requireSettings(userId: string, res: Response) {
  const settings = await getStoredQuipuSettings(userId);
  if (!settings) {
    res.status(400).json({ success: false, error: 'Quipu no está configurado. Ve a Configuración → Quipu.' });
    return null;
  }
  return settings;
}

// ── Contactos ──────────────────────────────────────────────────

export const getQuipuContacts = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const kind = req.query.kind || '';
    const path = `/contacts${kind ? `?filter[kind]=${kind}` : ''}`;
    const data = await fetchQuipuPaginatedList(settings, path);
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al obtener contactos de Quipu.' });
  }
};

export const createQuipuContact = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await quipuOwnerFetch(settings, '/contacts', {
      method: 'POST',
      body: JSON.stringify({ data: { type: 'contacts', attributes: req.body } }),
    });
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al crear contacto en Quipu.' });
  }
};

export const updateQuipuContact = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await quipuOwnerFetch(settings, `/contacts/${req.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'contacts', id: req.params.id, attributes: req.body } }),
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al actualizar contacto en Quipu.' });
  }
};

export const deleteQuipuContact = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    await quipuOwnerFetch(settings, `/contacts/${req.params.id}`, { method: 'DELETE' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al eliminar contacto en Quipu.' });
  }
};

// ── Facturas (invoices) ────────────────────────────────────────

export const getQuipuInvoices = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const { kind, status, contact_id, from, to } = req.query;
    const params = new URLSearchParams();
    params.set('sort', '-issued_at');
    if (kind)       params.set('filter[kind]', String(kind));
    if (status)     params.set('filter[status]', String(status));
    if (contact_id) params.set('filter[contact_id]', String(contact_id));
    if (from)       params.set('filter[from_date]', String(from));
    if (to)         params.set('filter[to_date]', String(to));
    const data = await fetchQuipuPaginatedList(settings, `/invoices?${params.toString()}`);
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al obtener facturas de Quipu.' });
  }
};

export const getQuipuInvoiceDetail = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await quipuOwnerFetch(settings, `/invoices/${req.params.id}?include=items,contact,numbering_series`);
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al obtener factura de Quipu.' });
  }
};

export const createQuipuInvoice = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await quipuOwnerFetch(settings, '/invoices', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    await logActivityForReq(req, 'Factura creada en Quipu', 'QUIPU', String(data?.data?.id || ''), undefined, 'CREATE');
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al crear factura en Quipu.' });
  }
};

export const updateQuipuInvoice = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await quipuOwnerFetch(settings, `/invoices/${req.params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(req.body),
    });
    await logActivityForReq(req, 'Factura actualizada en Quipu', 'QUIPU', req.params.id, undefined, 'UPDATE');
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al actualizar factura en Quipu.' });
  }
};

export const deleteQuipuInvoice = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    await quipuOwnerFetch(settings, `/invoices/${req.params.id}`, { method: 'DELETE' });
    await logActivityForReq(req, 'Factura eliminada en Quipu', 'QUIPU', req.params.id, undefined, 'DELETE');
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al eliminar factura en Quipu.' });
  }
};

export const sendQuipuInvoiceByEmail = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await quipuOwnerFetch(settings, `/invoices/${req.params.id}/send_by_email`, {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al enviar factura por email.' });
  }
};

// ── Cobros (receipts) ──────────────────────────────────────────

export const getQuipuReceipts = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await fetchQuipuPaginatedList(settings, '/receipts?sort=-settlement_date');
    res.json({ success: true, data });
  } catch (e: any) {
    // 404 = endpoint not available in this Quipu plan → return empty list gracefully
    if (e?.message?.includes('404') || e?.message?.includes('no encontrado')) {
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ success: false, error: e?.message || 'Error al obtener cobros de Quipu.' });
  }
};

export const createQuipuReceipt = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await quipuOwnerFetch(settings, '/receipts', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al crear cobro en Quipu.' });
  }
};

// ── Cuentas bancarias ──────────────────────────────────────────

export const getQuipuBankAccounts = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await fetchQuipuPaginatedList(settings, '/bank_accounts');
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al obtener cuentas bancarias de Quipu.' });
  }
};

export const getQuipuBankTransactions = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const { from, to } = req.query;
    const params = new URLSearchParams();
    params.set('sort', '-date');
    if (from) params.set('filter[from_date]', String(from));
    if (to)   params.set('filter[to_date]', String(to));
    const data = await fetchQuipuPaginatedList(
      settings,
      `/bank_accounts/${req.params.id}/bank_transactions?${params.toString()}`,
    );
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al obtener movimientos bancarios.' });
  }
};

// ── Series de numeración ───────────────────────────────────────

export const getQuipuNumberingSeries = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await fetchQuipuPaginatedList(settings, '/numbering_series');
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al obtener series de numeración.' });
  }
};

// ── Empresa ────────────────────────────────────────────────────

export const getQuipuCompany = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  try {
    const data = await quipuOwnerFetch(settings, '/company');
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Error al obtener datos de empresa.' });
  }
};

// ── Push factura local → Quipu ─────────────────────────────────

export const pushLocalFacturaToQuipu = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
  const settings = await requireSettings(userId, res);
  if (!settings) return;
  const { id } = req.params;

  try {
    const pushedQuipuId = await pushFacturaToQuipuInternal(userId, id);
    if (!pushedQuipuId) {
      return res.status(500).json({ success: false, error: 'No se pudo enviar la factura a Quipu.' });
    }
    return res.json({ success: true, data: { quipuId: pushedQuipuId } });

    const facturaRes = await pool.query(
      `SELECT ff.*, e.first_name, e.last_name, e.commercial_name, e.nif_cif, e.email
       FROM facturacion_facturas ff
       LEFT JOIN entities e ON e.id = ff.client_id
       WHERE ff.id = $1 AND ff.user_id = $2`,
      [id, userId],
    );
    if (!facturaRes.rows.length) return res.status(404).json({ success: false, error: 'Factura no encontrada.' });
    const f = facturaRes.rows[0];

    if (f.quipu_id) return res.status(400).json({ success: false, error: 'Esta factura ya está en Quipu.' });

    // Get token once — reuse for all calls
    const { accessToken } = await requestQuipuToken(settings);

    // Find matching Quipu contact from already-synced local table (no extra live API call)
    let contactQuipuId: string | null = null;
    if (f.contacto) {
      const localContact = await pool.query(
        `SELECT external_id FROM quipu_contacts
         WHERE user_id = $1 AND LOWER(contact_name) = LOWER($2) LIMIT 1`,
        [userId, f.contacto],
      );
      if (localContact.rows.length > 0) {
        contactQuipuId = localContact.rows[0].external_id;
      } else {
        // Create contact in Quipu using shared token
        try {
          const newContact = await quipuOwnerFetch<any>(settings, '/contacts', {
            method: 'POST',
            body: JSON.stringify({
              data: {
                type: 'contacts',
                attributes: {
                  kind: 'client',
                  name: f.contacto,
                  ...(f.nif_cif ? { tax_id: f.nif_cif } : {}),
                },
              },
            }),
          }, accessToken);
          contactQuipuId = String(newContact?.data?.id || '');
        } catch { /* contact creation failed — proceed without contact */ }
      }
    }

    // Build correct Quipu JSON:API invoice payload
    // Quipu accepts total_amount directly (no items required for simple invoices)
    const issueDate = f.fecha ? String(f.fecha).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const dueDate   = f.vencimiento ? String(f.vencimiento).slice(0, 10) : null;
    const baseAmount = Number(f.total) / 1.21;
    const filingNumber = buildQuipuFilingNumber(f.num, f.serie);

    const attributes: any = {
      kind:           'income',
      issue_date:     issueDate,
      ...(filingNumber ? { filing_number: filingNumber } : {}),
      due_date:       dueDate || undefined,
      subject:        f.contacto || 'Servicios profesionales',
      payment_method: f.forma_pago === 'tarjeta'  ? 'credit_card' :
                      f.forma_pago === 'efectivo' ? 'cash'        : 'bank_transfer',
      items_attributes: [{
        concept:          f.contacto || 'Servicios profesionales',
        unitary_amount:   baseAmount.toFixed(2),
        quantity:         1,
        vat_percent:      21.0,
        retention_percent: 0.0,
      }],
    };

    const relationships: any = {};
    if (contactQuipuId) {
      relationships.contact = { data: { id: contactQuipuId, type: 'contacts' } };
    }
    const seriesRow = await pool.query(
      `SELECT external_id FROM quipu_numbering_series WHERE user_id = $1 LIMIT 1`, [userId],
    );
    if (seriesRow.rows.length > 0) {
      relationships.numbering_series = { data: { id: seriesRow.rows[0].external_id, type: 'numbering_series' } };
    }

    const payload: any = {
      data: { type: 'invoices', attributes, ...(Object.keys(relationships).length ? { relationships } : {}) },
    };

    console.log(`[QuipuPush] payload for factura ${id}:`, JSON.stringify(payload));

    const created = await quipuOwnerFetch<any>(settings, '/invoices', {
      method: 'POST', body: JSON.stringify(payload),
    }, accessToken);

    console.log(`[QuipuPush] Quipu response:`, JSON.stringify(created?.data?.id));
    const quipuId = String(created?.data?.id || '');
    if (quipuId) {
      await pool.query(
        `UPDATE facturacion_facturas SET quipu_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
        [quipuId, id, userId],
      );
    }

    await logActivityForReq(req, `Factura ${f.num} enviada a Quipu (id: ${quipuId})`, 'QUIPU', quipuId, f.contacto, 'CREATE');
    res.json({ success: true, data: { quipuId, quipuInvoice: created?.data } });
  } catch (e: any) {
    console.error('[QuipuPush] error:', e?.message);
    let errorMessage = e?.message || 'Error al enviar factura a Quipu.';
    if (String(errorMessage).includes('numeration:')) {
      try {
        const numerations = await summarizeQuipuNumerations(userId);
        errorMessage = `${errorMessage} Series disponibles en Quipu sincronizadas: ${numerations}`;
      } catch (numerationError: any) {
        errorMessage = `${errorMessage} No se pudieron resumir las series: ${numerationError?.message || 'error'}`;
      }
    }
    if (String(errorMessage).includes('404')) {
      try {
        const token = await requestQuipuToken(settings);
        const endpointDiagnosis = await diagnoseQuipuEndpoints(settings, token.accessToken);
        errorMessage = `${errorMessage} Diagnostico: ${summarizeQuipuEndpointDiagnosis(endpointDiagnosis)}`;
      } catch (diagnosisError: any) {
        errorMessage = `${errorMessage} Diagnostico adicional fallido: ${diagnosisError?.message || 'error'}`;
      }
    }
    res.status(500).json({ success: false, error: errorMessage });
  }
};
