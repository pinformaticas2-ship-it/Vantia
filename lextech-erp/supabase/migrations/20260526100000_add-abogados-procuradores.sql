-- Añade campos de representación legal al expediente
-- abogado_propio: abogado del despacho que lleva el caso
-- abogado_contrario: abogado de la parte contraria
-- procurador_contrario: procurador de la parte contraria
-- (procurador ya existente = procurador propio / de nuestro cliente)

ALTER TABLE expedientes
  ADD COLUMN IF NOT EXISTS abogado_propio       VARCHAR(200),
  ADD COLUMN IF NOT EXISTS abogado_contrario    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS procurador_contrario VARCHAR(200);

-- Campos intermedios de extracción (se rellenan desde IA, se usan para calcular propio/contrario)
ALTER TABLE expedientes
  ADD COLUMN IF NOT EXISTS abogado_demandante   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS abogado_demandado    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS procurador_demandante VARCHAR(200),
  ADD COLUMN IF NOT EXISTS procurador_demandado  VARCHAR(200);
