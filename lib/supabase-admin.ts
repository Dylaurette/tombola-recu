import "server-only";
import { createClient } from "@supabase/supabase-js";

export function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Configuration Supabase incomplète : renseignez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isAuthorized(request: Request) {
  const expected = process.env.ADMIN_ACCESS_CODE;
  const provided = request.headers.get("x-admin-code");
  return Boolean(expected && provided && provided === expected);
}
