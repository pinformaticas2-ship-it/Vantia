-- ============================================================
--  VANTIA Legis ERP — Script de creación de tablas
--  Generado desde migrations.ts
--  Ejecutar en orden (respeta dependencias entre tablas)
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────────────────────────────────────────────────────────
-- Función compartida para updated_at automático
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────
-- 1. entities  (clientes y otras entidades)
-- ────────────────────────────────────────────────────────────

-- La secuencia debe existir ANTES de la tabla que la referencia
CREATE SEQUENCE IF NOT EXISTS entities_internal_number_seq;

CREATE TABLE IF NOT EXISTS entities (
  id                        UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                      VARCHAR(20)   NOT NULL DEFAULT 'CLIENTE',
  first_name                VARCHAR(100)  NOT NULL,
  last_name                 VARCHAR(150),
  commercial_name           VARCHAR(200),
  nif_cif                   VARCHAR(20)   NOT NULL,
  email                     VARCHAR(150),
  phone_1                   VARCHAR(20),
  address_town              VARCHAR(100),
  client_status             VARCHAR(20)   NOT NULL DEFAULT 'Alta',
  document_type             VARCHAR(20)   DEFAULT 'DNI',
  gender                    VARCHAR(1),
  birth_date                DATE,
  nationality               VARCHAR(100)  DEFAULT 'Española',
  expedition_country        VARCHAR(100)  DEFAULT 'España',
  legal_nature              VARCHAR(50),
  address_street            VARCHAR(255),
  address_cp                VARCHAR(10),
  address_province          VARCHAR(100),
  address_country           VARCHAR(100)  DEFAULT 'España',
  phone_2                   VARCHAR(20),
  phone_3                   VARCHAR(20),
  phone_mobile              VARCHAR(20),
  phone_fax                 VARCHAR(20),
  website                   VARCHAR(255),
  date_alta                 DATE          DEFAULT CURRENT_DATE,
  date_baja                 DATE,
  lopd                      VARCHAR(20)   NOT NULL DEFAULT 'Pendiente',
  commercial_communications VARCHAR(5)    DEFAULT 'No',
  center                    VARCHAR(150),
  photo_url                 TEXT,
  dni_image_url             TEXT,
  internal_number           INTEGER       DEFAULT nextval('entities_internal_number_seq'),
  created_by                VARCHAR(100)  NOT NULL DEFAULT 'SYSTEM',
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT entities_nif_cif_key UNIQUE (nif_cif)
);

-- Vincular la secuencia a la columna (ahora la tabla ya existe)
ALTER SEQUENCE entities_internal_number_seq OWNED BY entities.internal_number;

CREATE INDEX IF NOT EXISTS idx_entities_type          ON entities (type);
CREATE INDEX IF NOT EXISTS idx_entities_client_status ON entities (client_status);
CREATE INDEX IF NOT EXISTS idx_entities_nif_cif       ON entities (nif_cif);
CREATE INDEX IF NOT EXISTS idx_entities_created_at    ON entities (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entities_type_status   ON entities (type, client_status);
CREATE INDEX IF NOT EXISTS idx_entities_first_name    ON entities (first_name);
CREATE INDEX IF NOT EXISTS idx_entities_last_name     ON entities (last_name);
CREATE INDEX IF NOT EXISTS idx_entities_first_name_trgm ON entities USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_last_name_trgm  ON entities USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_nif_cif_trgm    ON entities USING gin (nif_cif gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_email_trgm      ON entities USING gin (email gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_entities_updated_at ON entities;
CREATE TRIGGER trg_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 2. client_files  (adjuntos por cliente/expediente)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_files (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        UUID         NOT NULL,   -- sin FK (sirve para clientes y expedientes)
  original_name    VARCHAR(300) NOT NULL,
  stored_name      VARCHAR(300) NOT NULL,
  mimetype         VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
  size_bytes       BIGINT       NOT NULL DEFAULT 0,
  category         VARCHAR(60)  NOT NULL DEFAULT 'adjunto',
  document_name    VARCHAR(300) DEFAULT NULL,
  attachment_type  VARCHAR(100) DEFAULT 'Sin clasificar',
  created_by       VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_files_client_id      ON client_files (client_id);
CREATE INDEX IF NOT EXISTS idx_client_files_client_created ON client_files (client_id, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- 3. activity_log  (trazabilidad de acciones)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
  user_name   VARCHAR(200) NOT NULL DEFAULT 'Sistema',
  action_type VARCHAR(60)  NOT NULL,
  entity_type VARCHAR(50),
  entity_id   UUID,
  entity_name VARCHAR(300),
  ip_address  VARCHAR(100),
  event_type  VARCHAR(30)  NOT NULL DEFAULT 'ACTION',
  session_id  VARCHAR(200),
  user_agent  VARCHAR(500),
  device_id   VARCHAR(120),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id    ON activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON activity_log (event_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity     ON activity_log (entity_type, entity_id);


-- ────────────────────────────────────────────────────────────
-- 4. vantia_chat_history  (historial del asistente VantIA)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vantia_chat_history (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     VARCHAR(150) NOT NULL,
  module_id   VARCHAR(255) NOT NULL,
  history     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vantia_chat_history_user_module
  ON vantia_chat_history (user_id, module_id);

DROP TRIGGER IF EXISTS trg_vantia_chat_history_updated_at ON vantia_chat_history;
CREATE TRIGGER trg_vantia_chat_history_updated_at
  BEFORE UPDATE ON vantia_chat_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 5. notes  (notas por cliente)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  content     TEXT         NOT NULL,
  category    VARCHAR(50)  DEFAULT 'general'
              CHECK (category IN ('general','urgente','seguimiento','recordatorio','comercial','legal','otro')),
  priority    VARCHAR(10)  DEFAULT 'normal'
              CHECK (priority IN ('baja','normal','alta','urgente')),
  color       VARCHAR(7)   DEFAULT '#FCD34D',
  created_by  VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_client_id      ON notes (client_id);
CREATE INDEX IF NOT EXISTS idx_notes_category       ON notes (category);
CREATE INDEX IF NOT EXISTS idx_notes_priority       ON notes (priority);
CREATE INDEX IF NOT EXISTS idx_notes_created_at     ON notes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_client_created ON notes (client_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_notes_updated_at ON notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 6. client_tasks  (tareas y plazos)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_tasks (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id     UUID         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id       VARCHAR(150),
  client_name   VARCHAR(300),
  expediente_id UUID,
  titulo        TEXT         NOT NULL,
  descripcion   TEXT,
  plazo         DATE,
  estado        VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','urgente','completada')),
  prioridad     VARCHAR(10)  NOT NULL DEFAULT 'media'
                CHECK (prioridad IN ('alta','media','baja')),
  tipo          VARCHAR(50)  NOT NULL DEFAULT 'otro',
  expediente    VARCHAR(100),
  juzgado       VARCHAR(150),
  num_proc      VARCHAR(100),
  fecha_aviso   DATE,
  importe       NUMERIC(12,2),
  notas         TEXT,
  etapa         VARCHAR(200),
  created_by    VARCHAR(150) NOT NULL DEFAULT 'SYSTEM',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_tasks_client_id ON client_tasks (client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_estado     ON client_tasks (estado);
CREATE INDEX IF NOT EXISTS idx_client_tasks_plazo      ON client_tasks (plazo);
CREATE INDEX IF NOT EXISTS idx_client_tasks_user_id    ON client_tasks (user_id);

DROP TRIGGER IF EXISTS trg_client_tasks_updated_at ON client_tasks;
CREATE TRIGGER trg_client_tasks_updated_at
  BEFORE UPDATE ON client_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 7. task_etapas  (etapas configurables del despacho)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_etapas (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre     VARCHAR(200) NOT NULL UNIQUE,
  orden      INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO task_etapas (nombre, orden) VALUES
  ('Sin Iniciar',                                          1),
  ('Backlog',                                              2),
  ('Sin Hacer',                                            3),
  ('En Curso',                                             4),
  ('Checkear',                                             5),
  ('CAMPOS RELLENADOS',                                    6),
  ('CONTESTACIÓN A LA DEMANDA',                            7),
  ('CUESTION CONVENIENTE U OPORTUNA',                      8),
  ('CONCLUSIONES',                                         9),
  ('SOLUCIONES EN LAS QUE ESTOY TRABAJANDO ACTUALMENTE',  10),
  ('En Duda',                                             11),
  ('Realizada',                                           12),
  ('HECHO',                                               13),
  ('Cancelada',                                           14)
ON CONFLICT (nombre) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 8. expedientes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expedientes (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  anio             INTEGER       NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  num_exp          INTEGER       NOT NULL,
  ref_propia       VARCHAR(100),
  descripcion      TEXT,
  tipo             VARCHAR(60)   NOT NULL DEFAULT 'judicial',
  cliente_id       UUID          REFERENCES entities(id) ON DELETE SET NULL,
  cliente_nombre   VARCHAR(200),
  contrario        VARCHAR(200),
  procurador       VARCHAR(200),
  juzgado          VARCHAR(200),
  tipo_proc        VARCHAR(100),
  num_autos        VARCHAR(100),
  nig              VARCHAR(50),
  estado           VARCHAR(20)   NOT NULL DEFAULT 'abierto'
                   CHECK (estado IN ('abierto','cerrado','suspendido','archivado')),
  observaciones    TEXT,
  fecha_inicio     DATE          DEFAULT CURRENT_DATE,
  fecha_cierre     DATE,
  importe          NUMERIC(12,2),
  tipos_asunto     VARCHAR(200),
  cuantia_principal NUMERIC(12,2),
  intereses        NUMERIC(12,2),
  costas           NUMERIC(12,2),
  cuantia_total    NUMERIC(12,2),
  indeterminado    BOOLEAN       NOT NULL DEFAULT FALSE,
  etapa            VARCHAR(100),
  persona_contacto VARCHAR(200),
  contacto         VARCHAR(200),
  centro           VARCHAR(150),
  color            VARCHAR(50)   DEFAULT 'ninguno',
  ref_expediente   VARCHAR(100),
  created_by       VARCHAR(150)  NOT NULL DEFAULT 'SYSTEM',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT idx_expedientes_anio_num UNIQUE (anio, num_exp)
);

CREATE INDEX IF NOT EXISTS idx_expedientes_cliente_id ON expedientes (cliente_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_estado     ON expedientes (estado);
CREATE INDEX IF NOT EXISTS idx_expedientes_tipo       ON expedientes (tipo);

DROP TRIGGER IF EXISTS trg_expedientes_updated_at ON expedientes;
CREATE TRIGGER trg_expedientes_updated_at
  BEFORE UPDATE ON expedientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 9. expediente_import_batches  (lotes de importación)
-- ────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_exp_import_batches_created_at ON expediente_import_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exp_import_batches_status     ON expediente_import_batches (status);
CREATE INDEX IF NOT EXISTS idx_exp_import_batches_user_id    ON expediente_import_batches (user_id);

DROP TRIGGER IF EXISTS trg_expediente_import_batches_updated_at ON expediente_import_batches;
CREATE TRIGGER trg_expediente_import_batches_updated_at
  BEFORE UPDATE ON expediente_import_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 10. expediente_import_items  (filas de cada lote)
-- ────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_exp_import_items_batch_id           ON expediente_import_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_exp_import_items_status             ON expediente_import_items (status);
CREATE INDEX IF NOT EXISTS idx_exp_import_items_created_expediente ON expediente_import_items (created_expediente_id);

DROP TRIGGER IF EXISTS trg_expediente_import_items_updated_at ON expediente_import_items;
CREATE TRIGGER trg_expediente_import_items_updated_at
  BEFORE UPDATE ON expediente_import_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 11. agenda_events  (citas y eventos de calendario)
-- ────────────────────────────────────────────────────────────
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
  location       VARCHAR(300),
  color          VARCHAR(20),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_events_start_at ON agenda_events (start_at DESC);
CREATE INDEX IF NOT EXISTS idx_agenda_events_user_id  ON agenda_events (user_id);
CREATE INDEX IF NOT EXISTS idx_agenda_events_status   ON agenda_events (status);

DROP TRIGGER IF EXISTS trg_agenda_events_updated_at ON agenda_events;
CREATE TRIGGER trg_agenda_events_updated_at
  BEFORE UPDATE ON agenda_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────
-- 12–17. Chat de equipo
-- ────────────────────────────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS chat_miembros (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  canal_id     UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
  user_id      VARCHAR(150) NOT NULL,
  user_name    VARCHAR(200),
  avatar_url   VARCHAR(500),
  role         VARCHAR(20)  NOT NULL DEFAULT 'miembro',
  role_label   VARCHAR(100) DEFAULT 'Miembro',
  status       VARCHAR(30)  DEFAULT 'disponible',
  last_read_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  joined_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(canal_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_mensajes (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  canal_id     UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
  user_id      VARCHAR(150) NOT NULL,
  user_name    VARCHAR(200),
  avatar_url   VARCHAR(500),
  contenido    TEXT         NOT NULL,
  tipo         VARCHAR(20)  NOT NULL DEFAULT 'texto',
  gif_url      VARCHAR(1000),
  image_url    VARCHAR(1000),
  reply_to_id  UUID         REFERENCES chat_mensajes(id) ON DELETE SET NULL,
  editado      BOOLEAN      NOT NULL DEFAULT false,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_reacciones (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  mensaje_id  UUID         NOT NULL REFERENCES chat_mensajes(id) ON DELETE CASCADE,
  user_id     VARCHAR(150) NOT NULL,
  user_name   VARCHAR(200),
  emoji       VARCHAR(10)  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(mensaje_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS chat_fijados (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  canal_id    UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
  mensaje_id  UUID         NOT NULL REFERENCES chat_mensajes(id) ON DELETE CASCADE,
  fijado_por  VARCHAR(150) NOT NULL,
  fijado_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(canal_id, mensaje_id)
);

CREATE TABLE IF NOT EXISTS chat_favoritos (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      VARCHAR(150) NOT NULL,
  canal_id     UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
  mensaje_id   UUID         NOT NULL REFERENCES chat_mensajes(id) ON DELETE CASCADE,
  favorito_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, mensaje_id)
);

CREATE TABLE IF NOT EXISTS chat_typing_status (
  canal_id    UUID         NOT NULL REFERENCES chat_canales(id) ON DELETE CASCADE,
  user_id     VARCHAR(150) NOT NULL,
  user_name   VARCHAR(200),
  avatar_url  VARCHAR(500),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (canal_id, user_id)
);

-- Índices de chat
CREATE INDEX IF NOT EXISTS idx_chat_mensajes_canal  ON chat_mensajes (canal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_mensajes_reply  ON chat_mensajes (reply_to_id);
CREATE INDEX IF NOT EXISTS idx_chat_miembros_user   ON chat_miembros (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_miembros_canal  ON chat_miembros (canal_id);
CREATE INDEX IF NOT EXISTS idx_chat_reacciones_msg  ON chat_reacciones (mensaje_id);
CREATE INDEX IF NOT EXISTS idx_chat_favoritos_user  ON chat_favoritos (user_id, favorito_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_favoritos_canal ON chat_favoritos (canal_id, favorito_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_typing_canal    ON chat_typing_status (canal_id, updated_at DESC);

-- Canales por defecto
INSERT INTO chat_canales (nombre, descripcion, tipo, created_by) VALUES
  ('general',  'Canal general del despacho',           'publico', 'SYSTEM'),
  ('avisos',   'Comunicaciones y avisos internos',      'publico', 'SYSTEM'),
  ('juridico', 'Debates y consultas jurídicas',         'publico', 'SYSTEM')
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 18. email_accounts  (cuentas IMAP/SMTP por usuario)
-- ────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id ON email_accounts (user_id);


-- ────────────────────────────────────────────────────────────
-- 19. emails  (caché de mensajes IMAP)
-- ────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_emails_account_folder ON emails (account_id, folder, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_user_id        ON emails (user_id);
CREATE INDEX IF NOT EXISTS idx_emails_is_read        ON emails (is_read);
CREATE INDEX IF NOT EXISTS idx_emails_is_starred     ON emails (is_starred);
CREATE INDEX IF NOT EXISTS idx_emails_from_email     ON emails (from_email);


-- ────────────────────────────────────────────────────────────
-- Permisos (Supabase — roles estándar)
-- ────────────────────────────────────────────────────────────
GRANT USAGE  ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL    ON ALL TABLES    IN SCHEMA public TO postgres, service_role;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES    IN SCHEMA public TO anon, authenticated;

-- ============================================================
-- FIN DEL SCRIPT  (19 tablas + índices + triggers)
-- ============================================================
