-- =============================================
-- MÓDULO: GESTIÓN DE ENTIDADES (CLIENTES 360º)
-- AUTOR: LexTech Architect & Elena Esmeralda Soare Tanase
-- FECHA: 06 Febrero 2026
-- =============================================

-- 1. Habilitamos la extensión para crear IDs únicos e irrepetibles (UUID)
-- Esto evita que si fusionamos bases de datos en el futuro, haya IDs duplicados (ej: Cliente 1 y Cliente 1).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA MAESTRA DE ENTIDADES
-- Aquí guardamos a cualquier persona o empresa que interactúe con el despacho.
CREATE TABLE IF NOT EXISTS entities (
    -- ID: El DNI interno del sistema. Imposible de adivinar.
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- DATOS DE FILIACIÓN (La base)
    type VARCHAR(20) DEFAULT 'CLIENTE', -- Puede ser CLIENTE, CONTRARIO, JUZGADO
    first_name VARCHAR(100) NOT NULL,   -- Nombre
    last_name VARCHAR(100),             -- Apellidos
    commercial_name VARCHAR(200),       -- Nombre Comercial (para empresas)
    
    -- IDENTIFICACIÓN LEGAL
    doc_type VARCHAR(20) DEFAULT 'NIF', -- NIF, CIF, PASAPORTE
    nif_cif VARCHAR(50) UNIQUE,         -- Clave única fiscal. (Índice automático)
    
    -- CONTACTO MULTICANAL (MNProgram Style)
    email VARCHAR(150),
    phone_1 VARCHAR(50), -- Teléfono Principal
    phone_2 VARCHAR(50), -- Móvil
    phone_3 VARCHAR(50), -- Fax / Otro
    website VARCHAR(200),
    
    -- UBICACIÓN FÍSICA
    address_street TEXT,
    address_city VARCHAR(100),
    address_province VARCHAR(100),
    address_zip VARCHAR(20),
    address_country VARCHAR(100) DEFAULT 'España',
    
    -- PERFILADO JURÍDICO
    legal_nature VARCHAR(50), -- Física / Jurídica
    client_status VARCHAR(20) DEFAULT 'ACTIVO', -- ACTIVO, BAJA, POTENCIAL
    
    -- METADATOS DE CONTROL (Trazabilidad)
    -- Importantísimo: Saber cuándo se creó y cuándo se modificó por última vez.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100) -- ID del usuario que lo creó (Clerk ID)
);

-- 3. ÍNDICES DE VELOCIDAD
-- Esto hace que buscar un cliente por nombre o NIF sea instantáneo, aunque tengas 1 millón de registros.
CREATE INDEX IF NOT EXISTS idx_entities_search 
ON entities(nif_cif, first_name, commercial_name);

-- 4. TABLA DE CUENTAS BANCARIAS (Relación 1 a N)
-- Un cliente puede tener muchas cuentas. Por eso las separamos en otra tabla.
CREATE TABLE IF NOT EXISTS entity_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE, -- Si borras cliente, se borran sus cuentas
    iban VARCHAR(50) NOT NULL,
    bank_name VARCHAR(100),
    is_primary BOOLEAN DEFAULT FALSE
);