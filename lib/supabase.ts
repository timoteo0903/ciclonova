import { createClient } from "@supabase/supabase-js";

// Cliente Supabase para uso server-side (API routes / Server Components).
// Retorna null si las variables de entorno no están configuradas,
// lo que hace que cafci.ts caiga al fallback de la API de CAFCI.

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = url && key ? createClient(url, key) : null;
