-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla: ieb_fondos_diario
-- Almacena VCP, AUM y CCP diarios para los 22 fondos / 96 clases de IEB S.A.
-- Clave primaria: (fecha, clase_id) → un registro por clase por día
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ieb_fondos_diario (
  fecha      date     NOT NULL,
  fondo_id   integer  NOT NULL,
  clase_id   integer  NOT NULL,
  vcp        numeric,          -- Valor cuotaparte × 1000
  aum        numeric,          -- Patrimonio neto (ARS o USD)
  ccp        numeric,          -- Capital cuotaparte × 1000
  PRIMARY KEY (fecha, clase_id)
);

-- Índice para consultas por fondo en un rango de fechas
CREATE INDEX IF NOT EXISTS idx_ieb_fondos_diario_fondo_fecha
  ON public.ieb_fondos_diario (fondo_id, fecha);

-- Índice para consultas por clase en un rango de fechas
CREATE INDEX IF NOT EXISTS idx_ieb_fondos_diario_clase_fecha
  ON public.ieb_fondos_diario (clase_id, fecha);

-- RLS: habilitar (opcional, ajustar según políticas del proyecto)
ALTER TABLE public.ieb_fondos_diario ENABLE ROW LEVEL SECURITY;

-- Política de solo lectura para el rol anon (dashboard público)
CREATE POLICY "ieb_fondos_diario_read"
  ON public.ieb_fondos_diario
  FOR SELECT
  USING (true);

-- Política de escritura solo para service_role (backfill y refresh)
-- (service_role bypasa RLS por defecto; esta política es explícita)
CREATE POLICY "ieb_fondos_diario_write"
  ON public.ieb_fondos_diario
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- (Opcional) Migrar datos existentes de ciclo_nova_diario
-- Ejecutar UNA sola vez para no perder el historial de Ciclo Nova.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.ieb_fondos_diario (fecha, fondo_id, clase_id, vcp, aum, ccp)
SELECT
  fecha,
  1717 AS fondo_id,
  class_id AS clase_id,
  vcp,
  aum,
  ccp
FROM public.ciclo_nova_diario
ON CONFLICT (fecha, clase_id) DO NOTHING;
