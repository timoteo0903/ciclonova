-- ─── Tabla de referencia: metadata de fondos ──────────────────────────────────
-- Permite que las vistas materializadas conozcan nombre y moneda por fondo_id.

CREATE TABLE IF NOT EXISTS ieb_fondos_config (
  fondo_id  integer PRIMARY KEY,
  fund_name text    NOT NULL,
  moneda    text    NOT NULL CHECK (moneda IN ('ARS', 'USD'))
);

INSERT INTO ieb_fondos_config (fondo_id, fund_name, moneda) VALUES
  (1220, 'MM Pesos',                       'ARS'),
  (827,  'T+0 Pesos',                      'ARS'),
  (1191, 'CER',                            'ARS'),
  (1334, 'Lecap T + 0',                    'ARS'),
  (891,  'Dolar Lked',                     'ARS'),
  (890,  'Acciones',                       'ARS'),
  (1445, 'FCIC Inmobiliario Puerto Nizuc', 'ARS'),
  (1600, 'MM Dolar',                       'USD'),
  (1517, 'Dolar Mep',                      'USD'),
  (1717, 'Ciclo Nova',                     'USD'),
  (892,  'Dolar Hard',                     'USD'),
  (1434, 'T+1 Dolar',                      'USD')
ON CONFLICT (fondo_id) DO UPDATE
  SET fund_name = EXCLUDED.fund_name,
      moneda    = EXCLUDED.moneda;


-- ─── Vista 1: AUM actual por fondo ────────────────────────────────────────────
-- Toma el último AUM disponible por clase y los suma por fondo.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_aum_por_fondo AS
WITH latest_per_class AS (
  SELECT DISTINCT ON (clase_id)
    fondo_id,
    aum
  FROM ieb_fondos_diario
  WHERE aum IS NOT NULL
  ORDER BY clase_id, fecha DESC
)
SELECT
  fc.fund_name,
  fc.moneda,
  SUM(lpc.aum) AS aum_total
FROM latest_per_class lpc
JOIN ieb_fondos_config fc ON fc.fondo_id = lpc.fondo_id
GROUP BY fc.fund_name, fc.moneda
ORDER BY fc.moneda, aum_total DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_aum_por_fondo
  ON mv_aum_por_fondo (fund_name);


-- ─── Vista 2: Evolución diaria de AUM (últimos 90 días, con forward-fill) ────
-- Genera una grilla fecha × clase, rellena los días sin AUM con el último
-- valor conocido (forward-fill), y suma por fecha y moneda.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_aum_history_90d AS
WITH
-- Todas las clases que tienen al menos un registro
classes AS (
  SELECT DISTINCT clase_id, fondo_id
  FROM ieb_fondos_diario
  WHERE fecha >= CURRENT_DATE - INTERVAL '90 days'
),
-- Grilla completa: cada fecha × cada clase
spine AS (
  SELECT
    d.fecha,
    c.clase_id,
    c.fondo_id
  FROM (
    SELECT generate_series(
      CURRENT_DATE - INTERVAL '90 days',
      CURRENT_DATE,
      '1 day'
    )::date AS fecha
  ) d
  CROSS JOIN classes c
),
-- Unir datos reales (puede tener huecos donde aum es null)
with_actuals AS (
  SELECT
    s.fecha,
    s.clase_id,
    s.fondo_id,
    d.aum,
    -- Contador de cuántos valores no-null hubo hasta este punto (define el grupo de forward-fill)
    COUNT(d.aum) OVER (
      PARTITION BY s.clase_id
      ORDER BY s.fecha
      ROWS UNBOUNDED PRECEDING
    ) AS grp
  FROM spine s
  LEFT JOIN ieb_fondos_diario d
    ON d.fecha = s.fecha AND d.clase_id = s.clase_id
),
-- Forward-fill: dentro de cada grupo, propagar el último valor conocido
filled AS (
  SELECT
    fecha,
    fondo_id,
    FIRST_VALUE(aum) OVER (
      PARTITION BY clase_id, grp
      ORDER BY fecha
    ) AS aum_filled
  FROM with_actuals
)
-- Suma diaria por moneda
SELECT
  f.fecha,
  fc.moneda,
  SUM(f.aum_filled) AS aum_total
FROM filled f
JOIN ieb_fondos_config fc ON fc.fondo_id = f.fondo_id
WHERE f.aum_filled IS NOT NULL
GROUP BY f.fecha, fc.moneda
ORDER BY f.fecha;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_aum_history_90d
  ON mv_aum_history_90d (fecha, moneda);


-- ─── Función para refrescar ambas vistas ──────────────────────────────────────
-- Llamar desde el job nocturno junto con refresh-all.

CREATE OR REPLACE FUNCTION refresh_dashboard_views()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_aum_por_fondo;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_aum_history_90d;
$$;
