-- À exécuter une seule fois dans Supabase > SQL Editor pour ajouter
-- la fonction de réinitialisation au projet Supabase déjà existant.
-- Cette opération conserve tous les participants et leurs coordonnées.
-- Elle ferme aussi l’accès direct des visiteurs aux tables : les téléphones
-- complets ne seront servis qu’à l’administration protégée.

revoke all on table public.participants, public.draws from anon, authenticated;

create or replace function public.reset_draws()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  -- Empêche un tirage de se dérouler en même temps que la réinitialisation.
  perform pg_advisory_xact_lock(2026111201);

  delete from public.draws;
  get diagnostics deleted_count = row_count;

  update public.participants
  set is_drawn = false
  where is_drawn = true;

  return deleted_count;
end;
$$;

revoke all on function public.reset_draws() from public, anon, authenticated;
grant execute on function public.reset_draws() to service_role;
