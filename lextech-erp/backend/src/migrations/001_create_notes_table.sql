-- ============================================================
-- MIGRACIÓN: Crear tabla de notas personalizables
-- Fecha: 12 de Marzo, 2026
-- Descripción: Agrega soporte para notas en clientes
-- ============================================================

-- Tabla de notas
CREATE TABLE IF NOT EXISTS notes (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relación
    client_id            UUID NOT NULL,
    FOREIGN KEY (client_id) REFERENCES entities(id) ON DELETE CASCADE,

    -- Contenido
    content              TEXT NOT NULL,

    -- Personalización
    category             VARCHAR(50)  DEFAULT 'general'
                         CHECK (category IN ('general','urgente','seguimiento','recordatorio','comercial','legal','otro')),
    priority             VARCHAR(10)  DEFAULT 'normal'
                         CHECK (priority IN ('baja','normal','alta','urgente')),
    color                VARCHAR(7)   DEFAULT '#FCD34D',  -- Color hex (default: amarillo)

    -- Auditoría
    created_by           VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_notes_client_id   ON notes (client_id);
CREATE INDEX IF NOT EXISTS idx_notes_category    ON notes (category);
CREATE INDEX IF NOT EXISTS idx_notes_priority    ON notes (priority);
CREATE INDEX IF NOT EXISTS idx_notes_created_at  ON notes (created_at DESC);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notes_updated_at ON notes;
CREATE TRIGGER trg_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_notes_updated_at();

-- Log de migración
DO $$
BEGIN
    RAISE NOTICE 'Migración 001: Tabla de notas creada exitosamente';
END $$;
