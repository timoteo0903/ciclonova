-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA cron TO postgres;

-- ─── Cron: ETL CAFCI diario ───────────────────────────────────────────────────
--
-- Corre todos los días a las 03:00 UTC (00:00 ART).
-- CAFCI publica los datos del día alrededor de las 20-21 hs Argentina.
-- A las 00:00 ART ya pasó la medianoche, así que "ayer" en Argentina = el día
-- que CAFCI acaba de publicar.
--
-- URL local (Docker interno):  http://kong:8000/functions/v1/etl-cafci
-- URL producción:               https://<PROJECT_REF>.supabase.co/functions/v1/etl-cafci
--
-- IMPORTANTE: antes de hacer push a producción, reemplazá la URL y el token
-- por los valores reales del proyecto, o usá pg_vault para almacenarlos.

SELECT cron.schedule(
  'etl-cafci-daily',
  '0 3 * * *',
  $$
  SELECT extensions.http_post(
    url     := 'http://kong:8000/functions/v1/etl-cafci',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
