-- Snapshot diario de VCP y patrimonio para todas las clases de fondos de CAFCI.
-- Una fila por (fecha, tipo_renta_id, fondo_nombre).
CREATE TABLE IF NOT EXISTS cafci_vcp_diario (
  id             BIGSERIAL    PRIMARY KEY,
  fecha          DATE         NOT NULL,
  tipo_renta_id  INT          NOT NULL,
  fondo_nombre   TEXT         NOT NULL,
  vcp            NUMERIC,
  patrimonio     NUMERIC,
  ccp            NUMERIC,
  ingested_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT cafci_vcp_diario_unique UNIQUE (fecha, tipo_renta_id, fondo_nombre)
);

-- Índices para consultas analíticas frecuentes
CREATE INDEX IF NOT EXISTS idx_cafci_vcp_fecha
  ON cafci_vcp_diario (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_cafci_vcp_fondo_fecha
  ON cafci_vcp_diario (fondo_nombre, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_cafci_vcp_tipo_fecha
  ON cafci_vcp_diario (tipo_renta_id, fecha DESC);
