-- ============================================================
-- LEXTECH AI · Schema Principal
-- Ejecutar: psql -U admin -d lextech_db -f lextech_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- TABLA: entities  (clientes, contrarios, juzgados, etc.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Referencia interna (auto-incremental, visible en formulario como "Número")
    internal_number          SERIAL UNIQUE,

    -- Clasificación
    type                     VARCHAR(20)  NOT NULL DEFAULT 'CLIENTE'
                             CHECK (type IN ('CLIENTE','CONTRARIO','JUZGADO','PERITO','PROVEEDOR')),
    client_status            VARCHAR(20)  NOT NULL DEFAULT 'Alta'
                             CHECK (client_status IN ('Alta','Baja','Suspendido','Potencial')),

    -- Identidad personal
    document_type            VARCHAR(20)  DEFAULT 'DNI'
                             CHECK (document_type IN ('DNI','NIE','Pasaporte','CIF','Otro')),
    first_name               VARCHAR(100) NOT NULL,
    last_name                VARCHAR(150),
    commercial_name          VARCHAR(200),
    nif_cif                  VARCHAR(20)  NOT NULL UNIQUE,
    gender                   VARCHAR(1)   CHECK (gender IN ('M','F','O')),
    birth_date               DATE,
    nationality              VARCHAR(100) DEFAULT 'Española',
    expedition_country       VARCHAR(100) DEFAULT 'España',
    legal_nature             VARCHAR(50)
                             CHECK (legal_nature IN ('Física','Jurídica','Autónomo','')),

    -- Dirección
    address_street           VARCHAR(255),
    address_town             VARCHAR(100),
    address_cp               VARCHAR(10),
    address_province         VARCHAR(100),
    address_country          VARCHAR(100) DEFAULT 'España',

    -- Contacto
    email                    VARCHAR(150),
    phone_1                  VARCHAR(20),
    phone_2                  VARCHAR(20),
    phone_3                  VARCHAR(20),
    phone_mobile             VARCHAR(20),
    phone_fax                VARCHAR(20),
    website                  VARCHAR(255),

    -- Administración
    date_alta                DATE         NOT NULL DEFAULT CURRENT_DATE,
    date_baja                DATE,
    lopd                     VARCHAR(20)  NOT NULL DEFAULT 'Pendiente'
                             CHECK (lopd IN ('Pendiente','Firmado','Rechazado','No aplica')),
    commercial_communications VARCHAR(5)  DEFAULT 'No'
                             CHECK (commercial_communications IN ('Sí','No')),
    center                   VARCHAR(150),

    -- Imágenes
    photo_url                VARCHAR(500),
    dni_image_url            VARCHAR(500),

    -- Auditoría
    created_by               VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_entities_nif_cif        ON entities (nif_cif);
CREATE INDEX IF NOT EXISTS idx_entities_type           ON entities (type);
CREATE INDEX IF NOT EXISTS idx_entities_client_status  ON entities (client_status);
CREATE INDEX IF NOT EXISTS idx_entities_created_at     ON entities (created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entities_updated_at ON entities;
CREATE TRIGGER trg_entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Migración segura: añadir columnas si la tabla ya existe
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS internal_number SERIAL UNIQUE;
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS client_status VARCHAR(20) DEFAULT 'Alta';
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS document_type VARCHAR(20) DEFAULT 'DNI';
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS gender VARCHAR(1);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS nationality VARCHAR(100) DEFAULT 'Española';
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS expedition_country VARCHAR(100) DEFAULT 'España';
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS legal_nature VARCHAR(50);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS address_street VARCHAR(255);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS address_cp VARCHAR(10);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS address_province VARCHAR(100);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS address_country VARCHAR(100) DEFAULT 'España';
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS phone_2 VARCHAR(20);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS phone_3 VARCHAR(20);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS phone_mobile VARCHAR(20);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS phone_fax VARCHAR(20);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS website VARCHAR(255);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS date_alta DATE DEFAULT CURRENT_DATE;
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS date_baja DATE;
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS lopd VARCHAR(20) DEFAULT 'Pendiente';
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS commercial_communications VARCHAR(5) DEFAULT 'No';
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS center VARCHAR(150);
  ALTER TABLE entities ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
