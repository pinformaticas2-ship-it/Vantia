import pool from './database';

/**
 * Ejecuta las migraciones al arrancar el servidor.
 * - Crea la tabla entities si no existe
 * - Añade columnas nuevas con ADD COLUMN IF NOT EXISTS (idempotente)
 * - Compatible tanto con fresh install como con bases de datos existentes
 */
export async function runMigrations(): Promise<void> {
  let client: any;

  // Intentar conectar — si falla, el servidor arranca igual pero sin BD
  try {
    client = await pool.connect();
  } catch (connErr: any) {
    console.error('❌ No se puede conectar a PostgreSQL:', connErr?.message || String(connErr));
    console.error('   → Comprueba que el servicio PostgreSQL esté iniciado y que DATABASE_URL sea correcta.');
    return;
  }

  try {
    console.log('🔄 Ejecutando migraciones de base de datos...');

    // Extensión UUID
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // ── Crear tabla principal si no existe ─────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS entities (
        id                        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        type                      VARCHAR(20)  NOT NULL DEFAULT 'CLIENTE',
        first_name                VARCHAR(100) NOT NULL,
        last_name                 VARCHAR(150),
        commercial_name           VARCHAR(200),
        nif_cif                   VARCHAR(20)  NOT NULL,
        email                     VARCHAR(150),
        phone_1                   VARCHAR(20),
        address_town              VARCHAR(100),
        created_by                VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
        created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── Añadir columnas nuevas de forma segura ─────────────────────
    const alterColumns: [string, string][] = [
      ['client_status',             `VARCHAR(20) NOT NULL DEFAULT 'Alta'`],
      ['document_type',             `VARCHAR(20) DEFAULT 'DNI'`],
      ['gender',                    `VARCHAR(1)`],
      ['birth_date',                `DATE`],
      ['nationality',               `VARCHAR(100) DEFAULT 'Española'`],
      ['expedition_country',        `VARCHAR(100) DEFAULT 'España'`],
      ['legal_nature',              `VARCHAR(50)`],
      ['address_street',            `VARCHAR(255)`],
      ['address_cp',                `VARCHAR(10)`],
      ['address_province',          `VARCHAR(100)`],
      ['address_country',           `VARCHAR(100) DEFAULT 'España'`],
      ['phone_2',                   `VARCHAR(20)`],
      ['phone_3',                   `VARCHAR(20)`],
      ['phone_mobile',              `VARCHAR(20)`],
      ['phone_fax',                 `VARCHAR(20)`],
      ['website',                   `VARCHAR(255)`],
      ['date_alta',                 `DATE DEFAULT CURRENT_DATE`],
      ['date_baja',                 `DATE`],
      ['lopd',                      `VARCHAR(20) NOT NULL DEFAULT 'Pendiente'`],
      ['commercial_communications', `VARCHAR(5) DEFAULT 'No'`],
      ['center',                    `VARCHAR(150)`],
      ['photo_url',                 `TEXT`],
      ['dni_image_url',             `TEXT`],
    ];

    for (const [col, def] of alterColumns) {
      try {
        await client.query(
          `ALTER TABLE entities ADD COLUMN IF NOT EXISTS ${col} ${def};`
        );
      } catch (_e: any) {
        // Ignorar — la columna ya existe o tiene restricción incompatible
      }
    }

    // Ampliar photo_url a TEXT por si ya existía como VARCHAR(500)
    try {
      await client.query(`ALTER TABLE entities ALTER COLUMN photo_url TYPE TEXT;`);
    } catch (_e: any) { /* Ignorar si ya es TEXT */ }

    // internal_number: añadir como INTEGER + secuencia automática
    try {
      await client.query(`ALTER TABLE entities ADD COLUMN IF NOT EXISTS internal_number INTEGER;`);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_attrdef ad
            JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
            WHERE a.attrelid = 'entities'::regclass AND a.attname = 'internal_number'
          ) THEN
            CREATE SEQUENCE IF NOT EXISTS entities_internal_number_seq;
            ALTER TABLE entities
              ALTER COLUMN internal_number SET DEFAULT nextval('entities_internal_number_seq');
            ALTER SEQUENCE entities_internal_number_seq OWNED BY entities.internal_number;
          END IF;
        END $$;
      `);
    } catch (_e: any) {
      // Si ya existe como SERIAL nativo, ignorar
    }

    // ── UNIQUE en nif_cif ──────────────────────────────────────────
    try {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'entities_nif_cif_key'
              AND conrelid = 'entities'::regclass
          ) THEN
            ALTER TABLE entities ADD CONSTRAINT entities_nif_cif_key UNIQUE (nif_cif);
          END IF;
        END $$;
      `);
    } catch (_e: any) {}

    // ── Índices ────────────────────────────────────────────────────
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_entities_type          ON entities (type)`,
      `CREATE INDEX IF NOT EXISTS idx_entities_client_status ON entities (client_status)`,
      `CREATE INDEX IF NOT EXISTS idx_entities_nif_cif       ON entities (nif_cif)`,
      `CREATE INDEX IF NOT EXISTS idx_entities_created_at    ON entities (created_at DESC)`,
    ]) {
      try { await client.query(idx); } catch (_e: any) {}
    }

    // ── Trigger updated_at ─────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);
    try { await client.query(`DROP TRIGGER IF EXISTS trg_entities_updated_at ON entities;`); } catch (_e: any) {}
    try {
      await client.query(`
        CREATE TRIGGER trg_entities_updated_at
          BEFORE UPDATE ON entities
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // ── Tabla client_files (adjuntos por cliente) ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_files (
        id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id     UUID         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        original_name VARCHAR(300) NOT NULL,
        stored_name   VARCHAR(300) NOT NULL,
        mimetype      VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
        size_bytes    BIGINT       NOT NULL DEFAULT 0,
        category      VARCHAR(60)  NOT NULL DEFAULT 'adjunto',
        created_by    VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files (client_id);`);
    } catch (_e: any) {}

    // ── Tabla activity_log (trazabilidad) ─────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
        user_name   VARCHAR(200) NOT NULL DEFAULT 'Sistema',
        action_type VARCHAR(60)  NOT NULL,
        entity_type VARCHAR(50),
        entity_id   UUID,
        entity_name VARCHAR(300),
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_user_id    ON activity_log (user_id);`);
    } catch (_e: any) {}

    // ── Permisos en schema public (requerido en PostgreSQL 15+) ────
    for (const grant of [
      `GRANT USAGE ON SCHEMA public TO admin`,
      `GRANT ALL ON ALL TABLES    IN SCHEMA public TO admin`,
      `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin`,
    ]) {
      try { await client.query(grant); } catch (_e: any) {}
    }

    console.log('✅ Migraciones completadas correctamente.');
  } catch (error: any) {
    console.error('❌ Error durante las migraciones:', error?.message || String(error));
  } finally {
    if (client) client.release();
  }
}
