"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const database_1 = __importDefault(require("./database"));
async function runMigrations() {
    let client;
    try {
        client = await database_1.default.connect();
    }
    catch (connErr) {
        console.error('❌ No se puede conectar a PostgreSQL:', connErr?.message || String(connErr));
        console.error('   → Comprueba que el servicio PostgreSQL esté iniciado y que DATABASE_URL sea correcta.');
        return;
    }
    try {
        console.log('🔄 Ejecutando migraciones de base de datos...');
        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
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
        const alterColumns = [
            ['client_status', `VARCHAR(20) NOT NULL DEFAULT 'Alta'`],
            ['document_type', `VARCHAR(20) DEFAULT 'DNI'`],
            ['gender', `VARCHAR(1)`],
            ['birth_date', `DATE`],
            ['nationality', `VARCHAR(100) DEFAULT 'Española'`],
            ['expedition_country', `VARCHAR(100) DEFAULT 'España'`],
            ['legal_nature', `VARCHAR(50)`],
            ['address_street', `VARCHAR(255)`],
            ['address_cp', `VARCHAR(10)`],
            ['address_province', `VARCHAR(100)`],
            ['address_country', `VARCHAR(100) DEFAULT 'España'`],
            ['phone_2', `VARCHAR(20)`],
            ['phone_3', `VARCHAR(20)`],
            ['phone_mobile', `VARCHAR(20)`],
            ['phone_fax', `VARCHAR(20)`],
            ['website', `VARCHAR(255)`],
            ['date_alta', `DATE DEFAULT CURRENT_DATE`],
            ['date_baja', `DATE`],
            ['lopd', `VARCHAR(20) NOT NULL DEFAULT 'Pendiente'`],
            ['commercial_communications', `VARCHAR(5) DEFAULT 'No'`],
            ['center', `VARCHAR(150)`],
            ['photo_url', `TEXT`],
            ['dni_image_url', `TEXT`],
        ];
        for (const [col, def] of alterColumns) {
            try {
                await client.query(`ALTER TABLE entities ADD COLUMN IF NOT EXISTS ${col} ${def};`);
            }
            catch (_e) {
            }
        }
        try {
            await client.query(`ALTER TABLE entities ALTER COLUMN photo_url TYPE TEXT;`);
        }
        catch (_e) { }
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
        }
        catch (_e) {
        }
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
        }
        catch (_e) { }
        for (const idx of [
            `CREATE INDEX IF NOT EXISTS idx_entities_type          ON entities (type)`,
            `CREATE INDEX IF NOT EXISTS idx_entities_client_status ON entities (client_status)`,
            `CREATE INDEX IF NOT EXISTS idx_entities_nif_cif       ON entities (nif_cif)`,
            `CREATE INDEX IF NOT EXISTS idx_entities_created_at    ON entities (created_at DESC)`,
        ]) {
            try {
                await client.query(idx);
            }
            catch (_e) { }
        }
        await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);
        try {
            await client.query(`DROP TRIGGER IF EXISTS trg_entities_updated_at ON entities;`);
        }
        catch (_e) { }
        try {
            await client.query(`
        CREATE TRIGGER trg_entities_updated_at
          BEFORE UPDATE ON entities
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
        }
        catch (_e) { }
        await client.query(`
      CREATE TABLE IF NOT EXISTS client_files (
        id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id        UUID         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        original_name    VARCHAR(300) NOT NULL,
        stored_name      VARCHAR(300) NOT NULL,
        mimetype         VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
        size_bytes       BIGINT       NOT NULL DEFAULT 0,
        category         VARCHAR(60)  NOT NULL DEFAULT 'adjunto',
        document_name    VARCHAR(300) DEFAULT NULL,
        attachment_type  VARCHAR(100) DEFAULT 'Sin clasificar',
        created_by       VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
        try {
            await client.query(`ALTER TABLE client_files ADD COLUMN IF NOT EXISTS document_name VARCHAR(300) DEFAULT NULL;`);
            await client.query(`ALTER TABLE client_files ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(100) DEFAULT 'Sin clasificar';`);
        }
        catch (_e) { }
        try {
            await client.query(`CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files (client_id);`);
        }
        catch (_e) { }
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
        }
        catch (_e) { }
        await client.query(`
      CREATE TABLE IF NOT EXISTS vantia_chat_history (
        id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     VARCHAR(150) NOT NULL,
        module_id   VARCHAR(255) NOT NULL,
        history     JSONB        NOT NULL DEFAULT '[]'::jsonb,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
        await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vantia_chat_history_user_module
      ON vantia_chat_history (user_id, module_id);
    `);
        try {
            await client.query(`
        CREATE TRIGGER trg_vantia_chat_history_updated_at
          BEFORE UPDATE ON vantia_chat_history
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
        }
        catch (_e) { }
        await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id        UUID         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        content          TEXT         NOT NULL,
        category         VARCHAR(50)  DEFAULT 'general'
                         CHECK (category IN ('general','urgente','seguimiento','recordatorio','comercial','legal','otro')),
        priority         VARCHAR(10)  DEFAULT 'normal'
                         CHECK (priority IN ('baja','normal','alta','urgente')),
        color            VARCHAR(7)   DEFAULT '#FCD34D',
        created_by       VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
        for (const idx of [
            `CREATE INDEX IF NOT EXISTS idx_notes_client_id  ON notes (client_id)`,
            `CREATE INDEX IF NOT EXISTS idx_notes_category   ON notes (category)`,
            `CREATE INDEX IF NOT EXISTS idx_notes_priority   ON notes (priority)`,
            `CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at DESC)`,
        ]) {
            try {
                await client.query(idx);
            }
            catch (_e) { }
        }
        try {
            await client.query(`
        CREATE TRIGGER trg_notes_updated_at
          BEFORE UPDATE ON notes
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
        }
        catch (_e) { }
        for (const idx of [
            `CREATE INDEX IF NOT EXISTS idx_entities_type_status ON entities (type, client_status)`,
            `CREATE INDEX IF NOT EXISTS idx_entities_first_name  ON entities (first_name)`,
            `CREATE INDEX IF NOT EXISTS idx_entities_last_name   ON entities (last_name)`,
            `CREATE INDEX IF NOT EXISTS idx_notes_client_created ON notes (client_id, created_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_client_files_client_created ON client_files (client_id, created_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_activity_log_entity   ON activity_log (entity_type, entity_id)`,
        ]) {
            try {
                await client.query(idx);
            }
            catch (_e) { }
        }
        try {
            await client.query(`ALTER TABLE client_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
        }
        catch (_e) { }
        try {
            await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
            for (const idx of [
                `CREATE INDEX IF NOT EXISTS idx_entities_first_name_trgm ON entities USING gin (first_name gin_trgm_ops)`,
                `CREATE INDEX IF NOT EXISTS idx_entities_last_name_trgm  ON entities USING gin (last_name gin_trgm_ops)`,
                `CREATE INDEX IF NOT EXISTS idx_entities_nif_cif_trgm    ON entities USING gin (nif_cif gin_trgm_ops)`,
                `CREATE INDEX IF NOT EXISTS idx_entities_email_trgm      ON entities USING gin (email gin_trgm_ops)`,
            ]) {
                try {
                    await client.query(idx);
                }
                catch (_e) { }
            }
        }
        catch (_e) {
        }
        await client.query(`
      CREATE TABLE IF NOT EXISTS client_tasks (
        id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id   UUID         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        titulo      TEXT         NOT NULL,
        descripcion TEXT,
        plazo       DATE,
        estado      VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','urgente','completada')),
        prioridad   VARCHAR(10)  NOT NULL DEFAULT 'media'
                    CHECK (prioridad IN ('alta','media','baja')),
        expediente  VARCHAR(100),
        created_by  VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
        for (const idx of [
            `CREATE INDEX IF NOT EXISTS idx_client_tasks_client_id  ON client_tasks (client_id)`,
            `CREATE INDEX IF NOT EXISTS idx_client_tasks_estado     ON client_tasks (estado)`,
            `CREATE INDEX IF NOT EXISTS idx_client_tasks_plazo      ON client_tasks (plazo)`,
        ]) {
            try {
                await client.query(idx);
            }
            catch (_e) { }
        }
        try {
            await client.query(`
        CREATE TRIGGER trg_client_tasks_updated_at
          BEFORE UPDATE ON client_tasks
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
        }
        catch (_e) { }
        try {
            await client.query(`ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) NOT NULL DEFAULT 'otro'`);
        }
        catch (_e) { }
        try {
            await client.query(`ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS juzgado VARCHAR(150)`);
        }
        catch (_e) { }
        try {
            await client.query(`ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS num_proc VARCHAR(100)`);
        }
        catch (_e) { }
        await client.query(`
      CREATE TABLE IF NOT EXISTS expedientes (
        id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
        anio           INTEGER       NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
        num_exp        INTEGER       NOT NULL,
        ref_propia     VARCHAR(100),
        descripcion    TEXT,
        tipo           VARCHAR(60)   NOT NULL DEFAULT 'judicial',
        cliente_id     UUID          REFERENCES entities(id) ON DELETE SET NULL,
        cliente_nombre VARCHAR(200),
        contrario      VARCHAR(200),
        procurador     VARCHAR(200),
        juzgado        VARCHAR(200),
        tipo_proc      VARCHAR(100),
        num_autos      VARCHAR(100),
        nig            VARCHAR(50),
        estado         VARCHAR(20)   NOT NULL DEFAULT 'abierto'
                       CHECK (estado IN ('abierto','cerrado','suspendido','archivado')),
        observaciones  TEXT,
        fecha_inicio   DATE          DEFAULT CURRENT_DATE,
        fecha_cierre   DATE,
        importe        NUMERIC(12,2),
        created_by     VARCHAR(150)  NOT NULL DEFAULT 'SYSTEM',
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);
        for (const idx of [
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_expedientes_anio_num ON expedientes (anio, num_exp)`,
            `CREATE INDEX IF NOT EXISTS idx_expedientes_cliente_id ON expedientes (cliente_id)`,
            `CREATE INDEX IF NOT EXISTS idx_expedientes_estado     ON expedientes (estado)`,
            `CREATE INDEX IF NOT EXISTS idx_expedientes_tipo       ON expedientes (tipo)`,
        ]) {
            try {
                await client.query(idx);
            }
            catch (_e) { }
        }
        try {
            await client.query(`
        CREATE TRIGGER trg_expedientes_updated_at
          BEFORE UPDATE ON expedientes
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
        }
        catch (_e) { }
        const expedientesCols = [
            ['tipos_asunto', `VARCHAR(200)`],
            ['cuantia_principal', `NUMERIC(12,2)`],
            ['intereses', `NUMERIC(12,2)`],
            ['costas', `NUMERIC(12,2)`],
            ['cuantia_total', `NUMERIC(12,2)`],
            ['indeterminado', `BOOLEAN NOT NULL DEFAULT FALSE`],
            ['etapa', `VARCHAR(100)`],
            ['persona_contacto', `VARCHAR(200)`],
            ['contacto', `VARCHAR(200)`],
            ['centro', `VARCHAR(150)`],
            ['color', `VARCHAR(50) DEFAULT 'ninguno'`],
            ['ref_expediente', `VARCHAR(100)`],
        ];
        for (const [col, def] of expedientesCols) {
            try {
                await client.query(`ALTER TABLE expedientes ADD COLUMN IF NOT EXISTS ${col} ${def};`);
            }
            catch (_e) { }
        }
        try {
            await client.query(`
        DELETE FROM activity_log
        WHERE id NOT IN (
          SELECT id FROM activity_log ORDER BY created_at DESC LIMIT 10000
        );
      `);
        }
        catch (_e) { }
        try {
            await client.query(`ANALYZE entities;`);
            await client.query(`ANALYZE notes;`);
            await client.query(`ANALYZE client_files;`);
            await client.query(`ANALYZE activity_log;`);
            await client.query(`ANALYZE vantia_chat_history;`);
        }
        catch (_e) { }
        for (const grant of [
            `GRANT USAGE ON SCHEMA public TO admin`,
            `GRANT ALL ON ALL TABLES    IN SCHEMA public TO admin`,
            `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin`,
        ]) {
            try {
                await client.query(grant);
            }
            catch (_e) { }
        }
        console.log('✅ Migraciones completadas correctamente.');
    }
    catch (error) {
        console.error('❌ Error durante las migraciones:', error?.message || String(error));
    }
    finally {
        if (client)
            client.release();
    }
}
