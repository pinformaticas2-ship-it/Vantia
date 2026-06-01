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
    await client.query(`CREATE EXTENSION IF NOT EXISTS unaccent;`);

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
      ['color',                     `VARCHAR(20) NOT NULL DEFAULT 'ninguno'`],
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
    // Agregar columnas nuevas si ya existe la tabla
    try {
      await client.query(`ALTER TABLE client_files ADD COLUMN IF NOT EXISTS document_name VARCHAR(300) DEFAULT NULL;`);
      await client.query(`ALTER TABLE client_files ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(100) DEFAULT 'Sin clasificar';`);
    } catch (_e: any) {}
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

    // ── Columnas nuevas en activity_log (idempotente) ─────────────────────────────
    const activityCols: [string, string][] = [
      ['ip_address',  'VARCHAR(100)'],
      ['event_type',  "VARCHAR(30) NOT NULL DEFAULT 'ACTION'"],
      ['session_id',  'VARCHAR(200)'],
      ['user_agent',  'VARCHAR(500)'],
      ['device_id',   'VARCHAR(120)'],
    ];
    for (const [col, def] of activityCols) {
      try { await client.query(`ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS ${col} ${def};`); } catch (_e: any) {}
    }
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON activity_log (event_type);`); } catch (_e: any) {}

    // ── Tabla vantia_chat_history (historial de conversaciones) ─────────────────
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
    // Crear un índice compuesto para búsquedas rápidas
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vantia_chat_history_user_module
      ON vantia_chat_history (user_id, module_id);
    `);
    // Reutilizar el trigger de updated_at
    try {
      await client.query(`
        CREATE TRIGGER trg_vantia_chat_history_updated_at
          BEFORE UPDATE ON vantia_chat_history
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // ── Tabla notes (notas personalizables en clientes) ────────────
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
      try { await client.query(idx); } catch (_e: any) {}
    }
    // Reutilizar trigger updated_at
    try {
      await client.query(`
        CREATE TRIGGER trg_notes_updated_at
          BEFORE UPDATE ON notes
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}
    try {
      await client.query(`
        ALTER TABLE notes
        ADD COLUMN IF NOT EXISTS expediente_id UUID REFERENCES expedientes(id) ON DELETE CASCADE
      `);
    } catch (_e: any) {}
    try {
      await client.query(`ALTER TABLE notes ALTER COLUMN client_id DROP NOT NULL`);
    } catch (_e: any) {}
    try {
      await client.query(`ALTER TABLE notes DROP CONSTRAINT IF EXISTS chk_notes_owner`);
    } catch (_e: any) {}
    try {
      await client.query(`
        ALTER TABLE notes
        ADD CONSTRAINT chk_notes_owner
        CHECK (client_id IS NOT NULL OR expediente_id IS NOT NULL)
      `);
    } catch (_e: any) {}
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_notes_expediente_id ON notes (expediente_id)`);
    } catch (_e: any) {}

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS expediente_relations (
          expediente_id UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
          related_expediente_id UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by VARCHAR(200),
          CONSTRAINT expediente_relations_not_same CHECK (expediente_id <> related_expediente_id),
          CONSTRAINT expediente_relations_unique UNIQUE (expediente_id, related_expediente_id)
        )
      `);
    } catch (_e: any) {}
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_expediente_relations_exp ON expediente_relations (expediente_id)`);
    } catch (_e: any) {}
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_expediente_relations_related ON expediente_relations (related_expediente_id)`);
    } catch (_e: any) {}

    // ── OPTIMIZACIONES DE BASE DE DATOS ─────────────────────────

    // Índices compuestos para búsquedas frecuentes
    for (const idx of [
      // Búsqueda de entidades por tipo + estado (filtro más común en listado)
      `CREATE INDEX IF NOT EXISTS idx_entities_type_status ON entities (type, client_status)`,
      // Búsqueda por nombre (para buscador de clientes)
      `CREATE INDEX IF NOT EXISTS idx_entities_first_name  ON entities (first_name)`,
      `CREATE INDEX IF NOT EXISTS idx_entities_last_name   ON entities (last_name)`,
      // Índice compuesto para notas (cliente + fecha, consulta más frecuente)
      `CREATE INDEX IF NOT EXISTS idx_notes_client_created ON notes (client_id, created_at DESC)`,
      // Índice compuesto para archivos (cliente + fecha)
      `CREATE INDEX IF NOT EXISTS idx_client_files_client_created ON client_files (client_id, created_at DESC)`,
      // Índice en activity_log por entidad (para ver historial de un cliente)
      `CREATE INDEX IF NOT EXISTS idx_activity_log_entity   ON activity_log (entity_type, entity_id)`,
    ]) {
      try { await client.query(idx); } catch (_e: any) {}
    }

    // Agregar updated_at a client_files si no tiene
    try {
      await client.query(`ALTER TABLE client_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    } catch (_e: any) {}

    // ── Índice trigram para búsquedas ILIKE rápidas ─────────────
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
      for (const idx of [
        `CREATE INDEX IF NOT EXISTS idx_entities_first_name_trgm ON entities USING gin (first_name gin_trgm_ops)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_last_name_trgm  ON entities USING gin (last_name gin_trgm_ops)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_nif_cif_trgm    ON entities USING gin (nif_cif gin_trgm_ops)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_email_trgm      ON entities USING gin (email gin_trgm_ops)`,
      ]) {
        try { await client.query(idx); } catch (_e: any) {}
      }
    } catch (_e: any) {
      // pg_trgm no disponible — los índices B-tree existentes funcionarán igualmente
    }

    // ── Tabla client_tasks (tareas y plazos por cliente) ──────────
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
      try { await client.query(idx); } catch (_e: any) {}
    }
    try {
      await client.query(`
        CREATE TRIGGER trg_client_tasks_updated_at
          BEFORE UPDATE ON client_tasks
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // Añadir columnas nuevas a client_tasks si no existen (migraciones incrementales)
    try {
      await client.query(`ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) NOT NULL DEFAULT 'otro'`);
    } catch (_e: any) {}
    try {
      await client.query(`ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS juzgado VARCHAR(150)`);
    } catch (_e: any) {}
    try {
      await client.query(`ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS num_proc VARCHAR(100)`);
    } catch (_e: any) {}

    // ── Tabla expedientes ──────────────────────────────────────
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
    // Índices expedientes
    for (const idx of [
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_expedientes_anio_num ON expedientes (anio, num_exp)`,
      `CREATE INDEX IF NOT EXISTS idx_expedientes_cliente_id ON expedientes (cliente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_expedientes_estado     ON expedientes (estado)`,
      `CREATE INDEX IF NOT EXISTS idx_expedientes_tipo       ON expedientes (tipo)`,
    ]) {
      try { await client.query(idx); } catch (_e: any) {}
    }
    // Trigger updated_at
    try {
      await client.query(`
        CREATE TRIGGER trg_expedientes_updated_at
          BEFORE UPDATE ON expedientes
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // Columnas nuevas en expedientes (migraciones incrementales idempotentes)
    const expedientesCols: [string, string][] = [
      ['tipos_asunto',       `VARCHAR(200)`],
      ['cuantia_principal',  `NUMERIC(12,2)`],
      ['intereses',          `NUMERIC(12,2)`],
      ['costas',             `NUMERIC(12,2)`],
      ['cuantia_total',      `NUMERIC(12,2)`],
      ['indeterminado',      `BOOLEAN NOT NULL DEFAULT FALSE`],
      ['etapa',              `VARCHAR(100)`],
      ['persona_contacto',   `VARCHAR(200)`],
      ['contacto',           `VARCHAR(200)`],
      ['centro',             `VARCHAR(150)`],
      ['color',              `VARCHAR(50) DEFAULT 'ninguno'`],
      ['ref_expediente',     `VARCHAR(100)`],
      ['demandantes',           `TEXT`],
      ['demandados',            `TEXT`],
      ['fecha_notificacion',    `DATE`],
      ['procurador_contrario',  `VARCHAR(200)`],
    ];
    for (const [col, def] of expedientesCols) {
      try {
        await client.query(`ALTER TABLE expedientes ADD COLUMN IF NOT EXISTS ${col} ${def};`);
      } catch (_e: any) {}
    }
    // -- Tabla de lotes de importacion de expedientes --
    await client.query(`
      CREATE TABLE IF NOT EXISTS expediente_import_batches (
        id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id          VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
        user_name        VARCHAR(200) NOT NULL DEFAULT 'Sistema',
        file_name        VARCHAR(255) NOT NULL,
        status           VARCHAR(30)  NOT NULL DEFAULT 'uploaded'
                         CHECK (status IN ('uploaded','configuring','reviewing','processing','completed','failed')),
        total_count      INTEGER      NOT NULL DEFAULT 0,
        completed_count  INTEGER      NOT NULL DEFAULT 0,
        error_count      INTEGER      NOT NULL DEFAULT 0,
        pending_count    INTEGER      NOT NULL DEFAULT 0,
        notes            TEXT,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_exp_import_batches_created_at ON expediente_import_batches (created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_exp_import_batches_status ON expediente_import_batches (status)`,
      `CREATE INDEX IF NOT EXISTS idx_exp_import_batches_user_id ON expediente_import_batches (user_id)`,
    ]) {
      try { await client.query(idx); } catch (_e: any) {}
    }
    try {
      await client.query(`
        CREATE TRIGGER trg_expediente_import_batches_updated_at
          BEFORE UPDATE ON expediente_import_batches
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // -- Tabla de filas/items de importacion de expedientes --
    await client.query(`
      CREATE TABLE IF NOT EXISTS expediente_import_items (
        id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        batch_id              UUID         NOT NULL REFERENCES expediente_import_batches(id) ON DELETE CASCADE,
        row_number            INTEGER,
        reference             VARCHAR(150),
        status                VARCHAR(30)  NOT NULL DEFAULT 'uploaded'
                              CHECK (status IN ('uploaded','processing','completed','failed')),
        error_message         TEXT,
        payload               JSONB,
        created_expediente_id UUID         REFERENCES expedientes(id) ON DELETE SET NULL,
        created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_exp_import_items_batch_id ON expediente_import_items (batch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_exp_import_items_status ON expediente_import_items (status)`,
      `CREATE INDEX IF NOT EXISTS idx_exp_import_items_created_expediente ON expediente_import_items (created_expediente_id)`,
    ]) {
      try { await client.query(idx); } catch (_e: any) {}
    }
    try {
      await client.query(`
        CREATE TRIGGER trg_expediente_import_items_updated_at
          BEFORE UPDATE ON expediente_import_items
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}


    // ── Eliminar FK de client_files.client_id → entities ──────────
    // client_files se usa también para expedientes (que no están en entities),
    // por lo que la restricción de clave foránea impide subir archivos en expedientes.
    try {
      await client.query(`ALTER TABLE client_files DROP CONSTRAINT IF EXISTS client_files_client_id_fkey;`);
    } catch (_e: any) {}
    // Por si el constraint tiene otro nombre generado por el sistema
    try {
      await client.query(`
        DO $$
        DECLARE r RECORD;
        BEGIN
          FOR r IN
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'client_files'
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'client_id'
          LOOP
            EXECUTE 'ALTER TABLE client_files DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
          END LOOP;
        END $$;
      `);
    } catch (_e: any) {}

    // ── client_tasks: añadir user_id y expediente_id si no existen ───────────
    for (const col of [
      `ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS user_id       VARCHAR(150)`,
      `ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS expediente_id UUID`,
      `ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS client_name   VARCHAR(300)`,
    ]) {
      try { await client.query(col); } catch (_e: any) {}
    }
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_client_tasks_user_id ON client_tasks (user_id)`); } catch (_e: any) {}

    // ── client_tasks: campos adicionales (recordatorio, importe, notas, etapa) ─
    for (const col of [
      `ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS fecha_aviso DATE`,
      `ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS importe     NUMERIC(12,2)`,
      `ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS notas       TEXT`,
      `ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS etapa       VARCHAR(200)`,
      `ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS agenda_event_id UUID`,
    ]) {
      try { await client.query(col); } catch (_e: any) {}
    }
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_client_tasks_agenda_event_id ON client_tasks (agenda_event_id)`); } catch (_e: any) {}

    // ── Tabla task_etapas (etapas configurables por el despacho) ─────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_etapas (
        id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre     VARCHAR(200) NOT NULL UNIQUE,
        orden      INTEGER      NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    // Insertar etapas por defecto (sólo si la tabla está vacía)
    await client.query(`
      INSERT INTO task_etapas (nombre, orden) VALUES
        ('Sin Iniciar',                                  1),
        ('Backlog',                                      2),
        ('Sin Hacer',                                    3),
        ('En Curso',                                     4),
        ('Checkear',                                     5),
        ('CAMPOS RELLENADOS',                            6),
        ('CONTESTACIÓN A LA DEMANDA',                    7),
        ('CUESTION CONVENIENTE U OPORTUNA',              8),
        ('CONCLUSIONES',                                 9),
        ('SOLUCIONES EN LAS QUE ESTOY TRABAJANDO ACTUALMENTE', 10),
        ('En Duda',                                      11),
        ('Realizada',                                    12),
        ('HECHO',                                        13),
        ('Cancelada',                                    14)
      ON CONFLICT (nombre) DO NOTHING;
    `);

    // ── Tabla agenda_events ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS agenda_events (
        id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id        VARCHAR(150) NOT NULL,
        user_name      VARCHAR(200),
        title          VARCHAR(300) NOT NULL,
        description    TEXT,
        start_at       TIMESTAMPTZ  NOT NULL,
        end_at         TIMESTAMPTZ,
        all_day        BOOLEAN      NOT NULL DEFAULT false,
        type           VARCHAR(50)  NOT NULL DEFAULT 'cita',
        status         VARCHAR(50)  NOT NULL DEFAULT 'pendiente',
        expediente_id  UUID,
        cliente_id     UUID,
        related_user_id VARCHAR(150),
        related_user_name VARCHAR(200),
        organization_context TEXT,
        location       VARCHAR(300),
        color          VARCHAR(20),
        source         VARCHAR(40)  NOT NULL DEFAULT 'manual',
        external_provider VARCHAR(40),
        external_id    VARCHAR(255),
        external_url   TEXT,
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    for (const col of [
      `ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'manual'`,
      `ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS external_provider VARCHAR(40)`,
      `ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)`,
      `ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS external_url TEXT`,
      `ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS related_user_id VARCHAR(150)`,
      `ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS related_user_name VARCHAR(200)`,
      `ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS organization_context TEXT`,
      `ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS task_id UUID`,
    ]) {
      try { await client.query(col); } catch (_e: any) {}
    }
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_agenda_events_start_at   ON agenda_events (start_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_agenda_events_user_id    ON agenda_events (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agenda_events_related_user_id ON agenda_events (related_user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agenda_events_status     ON agenda_events (status)`,
      `CREATE INDEX IF NOT EXISTS idx_agenda_events_task_id    ON agenda_events (task_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agenda_events_external   ON agenda_events (external_provider, external_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_agenda_events_google_unique
         ON agenda_events (external_provider, external_id)
         WHERE external_provider IS NOT NULL AND external_id IS NOT NULL`,
    ]) {
      try { await client.query(idx); } catch (_e: any) {}
    }
    // trigger updated_at
    try {
      await client.query(`
        CREATE OR REPLACE TRIGGER trg_agenda_events_updated_at
          BEFORE UPDATE ON agenda_events
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      `);
    } catch (_e: any) {}

    // ── Chat de equipo ─────────────────────────────────────────────────────────
    // ── Adjuntos propios por actuación/tarea ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_files (
        id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        task_id         UUID         NOT NULL,
        original_name   VARCHAR(500) NOT NULL,
        stored_name     VARCHAR(500) NOT NULL,
        mimetype        VARCHAR(255),
        size_bytes      BIGINT,
        document_name   VARCHAR(500),
        attachment_type VARCHAR(120) NOT NULL DEFAULT 'Sin clasificar',
        created_by      VARCHAR(150),
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files (task_id)`,
      `CREATE INDEX IF NOT EXISTS idx_task_files_created_at ON task_files (created_at DESC)`,
    ]) {
      try { await client.query(idx); } catch (_e: any) {}
    }
    try {
      await client.query(`
        CREATE OR REPLACE TRIGGER trg_task_files_updated_at
          BEFORE UPDATE ON task_files
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      `);
    } catch (_e: any) {}

    // Canales
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_canales (
        id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre        VARCHAR(100) NOT NULL,
        descripcion   TEXT,
        tipo          VARCHAR(20)  NOT NULL DEFAULT 'publico',
        expediente_id UUID,
        cliente_id    UUID,
        created_by    VARCHAR(150) NOT NULL,
        archivado     BOOLEAN      NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    // Miembros
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_miembros (
        id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        canal_id     UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
        user_id      VARCHAR(150) NOT NULL,
        user_name    VARCHAR(200),
        role         VARCHAR(20)  NOT NULL DEFAULT 'miembro',
        last_read_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        joined_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(canal_id, user_id)
      );
    `);
    // Mensajes
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_mensajes (
        id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        canal_id     UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
        user_id      VARCHAR(150) NOT NULL,
        user_name    VARCHAR(200),
        contenido    TEXT         NOT NULL,
        tipo         VARCHAR(20)  NOT NULL DEFAULT 'texto',
        reply_to_id  UUID         REFERENCES chat_mensajes(id) ON DELETE SET NULL,
        editado      BOOLEAN      NOT NULL DEFAULT false,
        deleted_at   TIMESTAMPTZ,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    // Reacciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_reacciones (
        id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        mensaje_id  UUID         NOT NULL REFERENCES chat_mensajes(id) ON DELETE CASCADE,
        user_id     VARCHAR(150) NOT NULL,
        user_name   VARCHAR(200),
        emoji       VARCHAR(10)  NOT NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(mensaje_id, user_id, emoji)
      );
    `);
    // Mensajes fijados
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_fijados (
        id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        canal_id    UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
        mensaje_id  UUID         NOT NULL REFERENCES chat_mensajes(id) ON DELETE CASCADE,
        fijado_por  VARCHAR(150) NOT NULL,
        fijado_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(canal_id, mensaje_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_favoritos (
        id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id      VARCHAR(150) NOT NULL,
        canal_id     UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
        mensaje_id   UUID         NOT NULL REFERENCES chat_mensajes(id) ON DELETE CASCADE,
        favorito_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, mensaje_id)
      );
    `);
    // Índices de chat
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_typing_status (
        canal_id    UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
        user_id     VARCHAR(150) NOT NULL,
        user_name   VARCHAR(200),
        avatar_url  VARCHAR(500),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        PRIMARY KEY (canal_id, user_id)
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_chat_mensajes_canal    ON chat_mensajes (canal_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_mensajes_reply    ON chat_mensajes (reply_to_id)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_miembros_user     ON chat_miembros (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_miembros_canal    ON chat_miembros (canal_id)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_reacciones_msg    ON chat_reacciones (mensaje_id)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_favoritos_user    ON chat_favoritos (user_id, favorito_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_favoritos_canal   ON chat_favoritos (canal_id, favorito_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_typing_canal      ON chat_typing_status (canal_id, updated_at DESC)`,
    ]) {
      try { await client.query(idx); } catch (_e: any) {}
    }
    // Canal general por defecto (idempotente por nombre único)
    try {
      await client.query(`
        INSERT INTO chat_canales (nombre, descripcion, tipo, created_by)
        VALUES ('general', 'Canal general del despacho', 'publico', 'SYSTEM'),
               ('avisos',  'Comunicaciones y avisos internos', 'publico', 'SYSTEM'),
               ('juridico','Debates y consultas jurídicas', 'publico', 'SYSTEM')
        ON CONFLICT DO NOTHING;
      `);
    } catch (_e: any) {}

    // ── Chat: columnas extra (idempotente) ────────────────────────────────────
    const chatMiembrosCols: [string, string][] = [
      ['avatar_url',  `VARCHAR(500)`],
      ['role_label',  `VARCHAR(100) DEFAULT 'Miembro'`],
      ['status',      `VARCHAR(30) DEFAULT 'disponible'`],
    ];
    for (const [col, def] of chatMiembrosCols) {
      try { await client.query(`ALTER TABLE chat_miembros ADD COLUMN IF NOT EXISTS ${col} ${def};`); } catch (_e: any) {}
    }
    const chatMensajesCols: [string, string][] = [
      ['avatar_url', `VARCHAR(500)`],
      ['gif_url',    `VARCHAR(1000)`],
      ['image_url',  `VARCHAR(1000)`],
    ];
    for (const [col, def] of chatMensajesCols) {
      try { await client.query(`ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS ${col} ${def};`); } catch (_e: any) {}
    }

    // ── Limpieza automática de activity_log (solo últimas 10.000 entradas) ──
    try {
      await client.query(`
        DELETE FROM activity_log
        WHERE id NOT IN (
          SELECT id FROM activity_log ORDER BY created_at DESC LIMIT 10000
        );
      `);
    } catch (_e: any) {}

    // ── Módulo de Correo ──────────────────────────────────────────────────────

    // Cuentas de correo configuradas por cada usuario
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_accounts (
        id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       VARCHAR(150) NOT NULL,
        label         VARCHAR(100) NOT NULL DEFAULT 'Mi cuenta',
        email         VARCHAR(200) NOT NULL,
        imap_host     VARCHAR(200) NOT NULL,
        imap_port     INTEGER      NOT NULL DEFAULT 993,
        imap_secure   BOOLEAN      NOT NULL DEFAULT true,
        smtp_host     VARCHAR(200) NOT NULL,
        smtp_port     INTEGER      NOT NULL DEFAULT 587,
        smtp_secure   BOOLEAN      NOT NULL DEFAULT false,
        username      VARCHAR(200) NOT NULL,
        password_enc  TEXT         NOT NULL,
        active        BOOLEAN      NOT NULL DEFAULT true,
        last_sync_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    // Añadir columna protocol si no existe (IMAP / POP3)
    try {
      await client.query(`ALTER TABLE email_accounts
        ADD COLUMN IF NOT EXISTS protocol VARCHAR(10) NOT NULL DEFAULT 'imap'`);
    } catch (_e: any) {}
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id ON email_accounts (user_id)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_oauth_profiles (
        id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id        VARCHAR(150) NOT NULL,
        provider       VARCHAR(30)  NOT NULL DEFAULT 'google',
        email          VARCHAR(200) NOT NULL,
        display_name   VARCHAR(200),
        avatar_url     TEXT,
        external_id    VARCHAR(200),
        last_used_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, provider, email)
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_email_oauth_profiles_user_id ON email_oauth_profiles (user_id, provider)`,
      `CREATE INDEX IF NOT EXISTS idx_email_oauth_profiles_last_used_at ON email_oauth_profiles (user_id, last_used_at DESC)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }
    try {
      await client.query(`
        CREATE TRIGGER trg_email_oauth_profiles_updated_at
          BEFORE UPDATE ON email_oauth_profiles
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // Emails cacheados desde IMAP
    await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        account_id      UUID         NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
        user_id         VARCHAR(150) NOT NULL,
        uid             BIGINT,
        message_id      VARCHAR(500),
        folder          VARCHAR(100) NOT NULL DEFAULT 'INBOX',
        from_email      VARCHAR(300),
        from_name       VARCHAR(300),
        to_emails       TEXT,
        cc_emails       TEXT,
        subject         VARCHAR(1000),
        snippet         TEXT,
        body_text       TEXT,
        body_html       TEXT,
        is_read         BOOLEAN      NOT NULL DEFAULT false,
        is_starred      BOOLEAN      NOT NULL DEFAULT false,
        is_draft        BOOLEAN      NOT NULL DEFAULT false,
        has_attachments BOOLEAN      NOT NULL DEFAULT false,
        size_bytes      INTEGER      DEFAULT 0,
        sent_at         TIMESTAMPTZ,
        expediente_id   UUID,
        cliente_id      UUID,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(account_id, uid, folder)
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_emails_account_folder  ON emails (account_id, folder, sent_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_emails_user_id         ON emails (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_emails_is_read         ON emails (is_read)`,
      `CREATE INDEX IF NOT EXISTS idx_emails_is_starred      ON emails (is_starred)`,
      `CREATE INDEX IF NOT EXISTS idx_emails_from_email      ON emails (from_email)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_contacts (
        id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       VARCHAR(150) NOT NULL,
        email         VARCHAR(300) NOT NULL,
        name          VARCHAR(300),
        source        VARCHAR(50)  NOT NULL DEFAULT 'manual',
        usage_count   INTEGER      NOT NULL DEFAULT 1,
        last_used_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, email)
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_email_contacts_user_id      ON email_contacts (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_email_contacts_last_used_at ON email_contacts (user_id, last_used_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_email_contacts_email        ON email_contacts (email)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }

    // ── Módulo de Facturación ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturacion_facturas (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       VARCHAR(150) NOT NULL,
        created_by    VARCHAR(200),
        num           VARCHAR(100) NOT NULL,
        contacto      VARCHAR(300) NOT NULL,
        fecha         DATE NOT NULL,
        vencimiento   DATE,
        total         NUMERIC(12,2) NOT NULL DEFAULT 0,
        estado        VARCHAR(30) NOT NULL DEFAULT 'pendiente',
        area          VARCHAR(30) NOT NULL DEFAULT 'procesal',
        responsable   VARCHAR(200),
        forma_pago    VARCHAR(30) NOT NULL DEFAULT 'transferencia',
        serie         VARCHAR(30) NOT NULL DEFAULT 'HON',
        tipo_cliente  VARCHAR(30) NOT NULL DEFAULT 'empresa',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturacion_gastos (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       VARCHAR(150) NOT NULL,
        created_by    VARCHAR(200),
        num           VARCHAR(100) NOT NULL,
        proveedor     VARCHAR(300) NOT NULL,
        fecha         DATE NOT NULL,
        total         NUMERIC(12,2) NOT NULL DEFAULT 0,
        categoria     VARCHAR(120) NOT NULL DEFAULT 'General',
        estado        VARCHAR(30) NOT NULL DEFAULT 'pendiente',
        area          VARCHAR(30) NOT NULL DEFAULT 'procesal',
        responsable   VARCHAR(200),
        deducible     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturacion_presupuestos (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       VARCHAR(150) NOT NULL,
        created_by    VARCHAR(200),
        num           VARCHAR(100) NOT NULL,
        contacto      VARCHAR(300) NOT NULL,
        fecha         DATE NOT NULL,
        total         NUMERIC(12,2) NOT NULL DEFAULT 0,
        estado        VARCHAR(30) NOT NULL DEFAULT 'pendiente',
        area          VARCHAR(30) NOT NULL DEFAULT 'procesal',
        responsable   VARCHAR(200),
        iguala        BOOLEAN NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    for (const col of [
      `ALTER TABLE facturacion_facturas ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES entities(id) ON DELETE SET NULL`,
      `ALTER TABLE facturacion_facturas ADD COLUMN IF NOT EXISTS expediente_id UUID REFERENCES expedientes(id) ON DELETE SET NULL`,
      `ALTER TABLE facturacion_facturas ADD COLUMN IF NOT EXISTS quipu_id VARCHAR(255)`,
      `ALTER TABLE facturacion_presupuestos ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES entities(id) ON DELETE SET NULL`,
      `ALTER TABLE facturacion_presupuestos ADD COLUMN IF NOT EXISTS expediente_id UUID REFERENCES expedientes(id) ON DELETE SET NULL`,
    ]) { try { await client.query(col); } catch (_e: any) {} }
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_facturacion_facturas_quipu_id
        ON facturacion_facturas (user_id, quipu_id)
        WHERE quipu_id IS NOT NULL
      `);
    } catch (_e: any) {}
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_facturacion_facturas_user_fecha ON facturacion_facturas (user_id, fecha DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_facturas_estado ON facturacion_facturas (estado)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_facturas_client ON facturacion_facturas (client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_facturas_expediente ON facturacion_facturas (expediente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_gastos_user_fecha ON facturacion_gastos (user_id, fecha DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_gastos_estado ON facturacion_gastos (estado)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_presupuestos_user_fecha ON facturacion_presupuestos (user_id, fecha DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_presupuestos_estado ON facturacion_presupuestos (estado)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_presupuestos_client ON facturacion_presupuestos (client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_facturacion_presupuestos_expediente ON facturacion_presupuestos (expediente_id)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }
    for (const trg of [
      `DROP TRIGGER IF EXISTS trg_facturacion_facturas_updated_at ON facturacion_facturas;`,
      `DROP TRIGGER IF EXISTS trg_facturacion_gastos_updated_at ON facturacion_gastos;`,
      `DROP TRIGGER IF EXISTS trg_facturacion_presupuestos_updated_at ON facturacion_presupuestos;`,
    ]) { try { await client.query(trg); } catch (_e: any) {} }
    try {
      await client.query(`
        CREATE TRIGGER trg_facturacion_facturas_updated_at
          BEFORE UPDATE ON facturacion_facturas
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}
    try {
      await client.query(`
        CREATE TRIGGER trg_facturacion_gastos_updated_at
          BEFORE UPDATE ON facturacion_gastos
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}
    try {
      await client.query(`
        CREATE TRIGGER trg_facturacion_presupuestos_updated_at
          BEFORE UPDATE ON facturacion_presupuestos
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}
    await client.query(`
      CREATE TABLE IF NOT EXISTS quipu_settings (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id           VARCHAR(150) NOT NULL UNIQUE,
        app_id            TEXT NOT NULL,
        app_secret        TEXT NOT NULL,
        base_url          TEXT NOT NULL DEFAULT 'https://getquipu.com',
        owner_slug        VARCHAR(255),
        access_token      TEXT,
        token_type        VARCHAR(50),
        token_expires_at  TIMESTAMPTZ,
        last_sync_at      TIMESTAMPTZ,
        sync_summary      JSONB,
        quipu_company     VARCHAR(255),
        quipu_email       VARCHAR(255),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    try { await client.query(`ALTER TABLE quipu_settings ADD COLUMN IF NOT EXISTS owner_slug VARCHAR(255)`); } catch (_e: any) {}
    try { await client.query(`CREATE INDEX IF NOT EXISTS idx_quipu_settings_user_id ON quipu_settings (user_id);`); } catch (_e: any) {}
    try { await client.query(`DROP TRIGGER IF EXISTS trg_quipu_settings_updated_at ON quipu_settings;`); } catch (_e: any) {}
    try {
      await client.query(`
        CREATE TRIGGER trg_quipu_settings_updated_at
          BEFORE UPDATE ON quipu_settings
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // ── Módulo de WhatsApp Business ───────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        wa_message_id     VARCHAR(255) UNIQUE,
        client_id         UUID         REFERENCES entities(id) ON DELETE SET NULL,
        direction         VARCHAR(20)  NOT NULL DEFAULT 'outbound',
        message_type      VARCHAR(40)  NOT NULL DEFAULT 'text',
        from_phone        VARCHAR(30),
        to_phone          VARCHAR(30),
        contact_name      VARCHAR(255),
        body              TEXT,
        status            VARCHAR(40)  NOT NULL DEFAULT 'queued',
        sent_by_user_id   VARCHAR(150),
        sent_by_user_name VARCHAR(200),
        raw_payload       JSONB,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    for (const col of [
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS wa_message_id VARCHAR(255)`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS client_id UUID`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'outbound'`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(40) NOT NULL DEFAULT 'text'`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS from_phone VARCHAR(30)`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS to_phone VARCHAR(30)`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255)`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS body TEXT`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'queued'`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sent_by_user_id VARCHAR(150)`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sent_by_user_name VARCHAR(200)`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS raw_payload JSONB`,
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    ]) {
      try { await client.query(col); } catch (_e: any) {}
    }
    try {
      await client.query(`
        ALTER TABLE whatsapp_messages
        ADD CONSTRAINT whatsapp_messages_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES entities(id) ON DELETE SET NULL
      `);
    } catch (_e: any) {}
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_client_created ON whatsapp_messages (client_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from_phone ON whatsapp_messages (from_phone)`,
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_to_phone ON whatsapp_messages (to_phone)`,
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages (status)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }
    try {
      await client.query(`
        CREATE OR REPLACE TRIGGER trg_whatsapp_messages_updated_at
          BEFORE UPDATE ON whatsapp_messages
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_schedules (
        id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id         UUID         REFERENCES entities(id) ON DELETE SET NULL,
        phone             VARCHAR(30)  NOT NULL,
        body              TEXT         NOT NULL,
        scheduled_for     TIMESTAMPTZ  NOT NULL,
        status            VARCHAR(30)  NOT NULL DEFAULT 'pending',
        created_by_user_id VARCHAR(150),
        created_by_user_name VARCHAR(200),
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_schedules_client ON whatsapp_schedules (client_id, scheduled_for DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_schedules_status ON whatsapp_schedules (status, scheduled_for ASC)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }
    try {
      await client.query(`
        CREATE OR REPLACE TRIGGER trg_whatsapp_schedules_updated_at
          BEFORE UPDATE ON whatsapp_schedules
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_settings (
        id                   INTEGER      PRIMARY KEY DEFAULT 1,
        access_token         TEXT,
        phone_number_id      VARCHAR(255),
        verify_token         VARCHAR(255),
        graph_version        VARCHAR(20)  NOT NULL DEFAULT 'v23.0',
        webhook_base_url     TEXT,
        business_account_id  VARCHAR(255),
        updated_by_user_id   VARCHAR(150),
        updated_by_user_name VARCHAR(200),
        created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT whatsapp_settings_singleton CHECK (id = 1)
      );
    `);
    for (const col of [
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS access_token TEXT`,
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(255)`,
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS verify_token VARCHAR(255)`,
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS graph_version VARCHAR(20) NOT NULL DEFAULT 'v23.0'`,
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS webhook_base_url TEXT`,
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS business_account_id VARCHAR(255)`,
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(150)`,
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS updated_by_user_name VARCHAR(200)`,
      `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    ]) { try { await client.query(col); } catch (_e: any) {} }
    try {
      await client.query(`
        INSERT INTO whatsapp_settings (id)
        VALUES (1)
        ON CONFLICT (id) DO NOTHING
      `);
    } catch (_e: any) {}
    try {
      await client.query(`
        CREATE OR REPLACE TRIGGER trg_whatsapp_settings_updated_at
          BEFORE UPDATE ON whatsapp_settings
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // ── Tabla exp_notificaciones (cronología de notificaciones judiciales) ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS exp_notificaciones (
        id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        expediente_id   UUID         NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
        tipo            VARCHAR(100) NOT NULL DEFAULT 'notificacion',
        titulo          VARCHAR(300) NOT NULL,
        descripcion     TEXT,
        fecha_recepcion DATE         NOT NULL DEFAULT CURRENT_DATE,
        fecha_limite    DATE,
        estado          VARCHAR(30)  NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','respondida','archivada')),
        created_by      VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_exp_notificaciones_expediente ON exp_notificaciones (expediente_id, fecha_recepcion DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_exp_notificaciones_estado     ON exp_notificaciones (estado)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }
    try {
      await client.query(`
        CREATE OR REPLACE TRIGGER trg_exp_notificaciones_updated_at
          BEFORE UPDATE ON exp_notificaciones
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // ── Configuración de contadores de expedientes ─────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS expediente_counter_config (
        anio         INTEGER PRIMARY KEY,
        min_num      INTEGER NOT NULL DEFAULT 1,
        auto_fill    BOOLEAN NOT NULL DEFAULT TRUE,
        override_next INTEGER
      );
    `);
    for (const col of [
      `ALTER TABLE expediente_counter_config ADD COLUMN IF NOT EXISTS auto_fill BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE expediente_counter_config ADD COLUMN IF NOT EXISTS override_next INTEGER`,
    ]) { try { await client.query(col); } catch (_e: any) {} }

    // ── Tabla expediente_apuntes (libro mayor / apuntes contables por expediente) ─
    await client.query(`
      CREATE TABLE IF NOT EXISTS expediente_apuntes (
        id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
        expediente_id   UUID          NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
        concepto        VARCHAR(300)  NOT NULL,
        tipo            VARCHAR(10)   NOT NULL DEFAULT 'cargo'
                        CHECK (tipo IN ('cargo', 'abono')),
        importe         NUMERIC(12,2) NOT NULL DEFAULT 0,
        fecha           DATE          NOT NULL DEFAULT CURRENT_DATE,
        notas           TEXT,
        created_by      VARCHAR(150)  NOT NULL DEFAULT 'SYSTEM',
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);
    for (const idx of [
      `CREATE INDEX IF NOT EXISTS idx_exp_apuntes_expediente ON expediente_apuntes (expediente_id, fecha DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_exp_apuntes_tipo       ON expediente_apuntes (tipo)`,
    ]) { try { await client.query(idx); } catch (_e: any) {} }
    try {
      await client.query(`
        CREATE OR REPLACE TRIGGER trg_exp_apuntes_updated_at
          BEFORE UPDATE ON expediente_apuntes
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    } catch (_e: any) {}

    // VACUUM ANALYZE para mantener las estadísticas de consulta frescas
    try {
      await client.query(`ANALYZE entities;`);
      await client.query(`ANALYZE notes;`);
      await client.query(`ANALYZE client_files;`);
      await client.query(`ANALYZE activity_log;`);
      await client.query(`ANALYZE vantia_chat_history;`);
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
