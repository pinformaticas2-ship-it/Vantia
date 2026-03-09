-- -------------------------------------------------------------------------
-- LEXTECH AI - ESQUEMA V3: FICHA DE CLIENTE AVANZADA (MNPROGRAM REPLICA)
-- Objetivo: Soporte para todos los campos de filiación y pestañas satélite.
-- -------------------------------------------------------------------------

-- 1. AMPLIACIÓN DE LA TABLA ENTIDADES (CLIENTES)
ALTER TABLE entities
    -- Identificación y Filiación
    ADD COLUMN IF NOT EXISTS second_last_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) DEFAULT 'NIF', -- NIF, CIF, PASAPORTE, NIE
    ADD COLUMN IF NOT EXISTS gender VARCHAR(20), -- HOMBRE, MUJER, OTRO, EMPRESA
    ADD COLUMN IF NOT EXISTS nationality VARCHAR(100),
    ADD COLUMN IF NOT EXISTS birth_date DATE,
    
    -- Datos de Contacto Avanzados
    ADD COLUMN IF NOT EXISTS phone_2 VARCHAR(50),
    ADD COLUMN IF NOT EXISTS phone_3 VARCHAR(50), -- Móvil adicional
    ADD COLUMN IF NOT EXISTS fax VARCHAR(50),
    ADD COLUMN IF NOT EXISTS website VARCHAR(255),
    
    -- Dirección Detallada
    ADD COLUMN IF NOT EXISTS address_postal_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS address_town VARCHAR(100), -- Población
    ADD COLUMN IF NOT EXISTS address_province VARCHAR(100),
    ADD COLUMN IF NOT EXISTS address_country VARCHAR(100),
    
    -- Clasificación y Negocio
    ADD COLUMN IF NOT EXISTS commercial_name VARCHAR(255), -- Nombre comercial
    ADD COLUMN IF NOT EXISTS legal_nature VARCHAR(100), -- S.L., S.A., Autónomo, Física
    ADD COLUMN IF NOT EXISTS client_type VARCHAR(50), -- VIP, Igualada, Esporádico
    ADD COLUMN IF NOT EXISTS center VARCHAR(100), -- Delegación o Centro
    ADD COLUMN IF NOT EXISTS client_status VARCHAR(20) DEFAULT 'ALTA', -- ALTA, BAJA, POTENCIAL
    ADD COLUMN IF NOT EXISTS date_registration DATE DEFAULT CURRENT_DATE, -- Fecha Alta
    ADD COLUMN IF NOT EXISTS date_cancellation DATE, -- Fecha Baja
    
    -- Legal y LOPD
    ADD COLUMN IF NOT EXISTS lopd_signed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lopd_date TIMESTAMP,
    ADD COLUMN IF NOT EXISTS commercial_communications BOOLEAN DEFAULT TRUE,
    
    -- Acceso Portal Cliente
    ADD COLUMN IF NOT EXISTS portal_access BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS portal_user VARCHAR(100); -- Usuario vinculado

-- 2. TABLAS SATÉLITE (PARA LAS PESTAÑAS)

-- Pestaña: Datos Bancarios
CREATE TABLE IF NOT EXISTS entity_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    iban VARCHAR(34) NOT NULL,
    bank_name VARCHAR(100),
    swift_bic VARCHAR(20),
    is_primary BOOLEAN DEFAULT FALSE,
    mandate_ref VARCHAR(100), -- Referencia mandato SEPA
    created_at TIMESTAMP DEFAULT NOW()
);

-- Pestaña: Notas (Bitácora)
CREATE TABLE IF NOT EXISTS entity_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    author_id VARCHAR(255), -- Usuario que escribe
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE, -- Nota fijada arriba
    created_at TIMESTAMP DEFAULT NOW()
);

-- Pestaña: Rentabilidad / Resumen Económico (Caché de cálculos)
-- Aunque se calcula en tiempo real, guardamos cierres mensuales
CREATE TABLE IF NOT EXISTS entity_financial_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    period VARCHAR(7), -- '2026-01'
    total_invoiced DECIMAL(12,2) DEFAULT 0,
    total_paid DECIMAL(12,2) DEFAULT 0,
    total_costs DECIMAL(12,2) DEFAULT 0, -- Horas imputadas * coste hora
    profitability DECIMAL(5,2), -- % Rentabilidad
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas en el buscador global
CREATE INDEX IF NOT EXISTS idx_entities_nif ON entities(nif_cif);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(first_name, last_name, commercial_name);