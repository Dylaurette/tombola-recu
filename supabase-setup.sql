-- Felicity Solar Distribution - Tombola des numéros de facture
-- À exécuter une seule fois dans Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.participants (
  invoice_number text primary key,
  customer_name text not null,
  phone text not null,
  is_drawn boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.draws (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique references public.participants(invoice_number),
  created_at timestamptz not null default now()
);

create index if not exists participants_is_drawn_idx on public.participants(is_drawn);
create index if not exists draws_created_at_idx on public.draws(created_at desc);

-- Les données publiques sont servies par les routes API Next.js.
-- Les coordonnées complètes ne sont jamais exposées directement aux visiteurs.
alter table public.participants enable row level security;
alter table public.draws enable row level security;

-- Les visiteurs publics passent par les routes API Next.js : elles masquent
-- les téléphones. Aucun accès direct aux tables n'est accordé au navigateur.
revoke all on table public.participants, public.draws from anon, authenticated;
grant all on table public.participants, public.draws to service_role;

drop policy if exists "Public can read participants" on public.participants;
create policy "Public can read participants" on public.participants
  for select to anon, authenticated using (true);

drop policy if exists "Public can read draw results" on public.draws;
create policy "Public can read draw results" on public.draws
  for select to anon, authenticated using (true);

-- Aucune politique INSERT/UPDATE/DELETE publique n'est créée.

create or replace function public.draw_next_participant()
returns table (
  invoice_number text,
  customer_name text,
  phone text,
  is_drawn boolean,
  draw_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected public.participants%rowtype;
  new_draw_id uuid;
  new_created_at timestamptz;
begin
  -- Verrou global : sérialise les tirages lancés presque simultanément.
  perform pg_advisory_xact_lock(2026111201);

  select * into selected
  from public.participants
  where participants.is_drawn = false
  order by random()
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.participants
  set is_drawn = true
  where participants.invoice_number = selected.invoice_number;

  insert into public.draws(invoice_number)
  values (selected.invoice_number)
  returning id, draws.created_at into new_draw_id, new_created_at;

  return query select selected.invoice_number, selected.customer_name, selected.phone,
    true, new_draw_id, new_created_at;
end;
$$;

revoke all on function public.draw_next_participant() from public, anon, authenticated;
grant execute on function public.draw_next_participant() to service_role;

-- L'espace public interroge l'API Next.js toutes les 5 secondes.
-- Realtime n'est pas nécessaire et les visiteurs n'ont donc aucun accès direct aux tables.


create or replace function public.reset_draws()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  perform pg_advisory_xact_lock(2026111201);
  delete from public.draws;
  get diagnostics deleted_count = row_count;
  update public.participants set is_drawn = false where is_drawn = true;
  return deleted_count;
end;
$$;

revoke all on function public.reset_draws() from public, anon, authenticated;
grant execute on function public.reset_draws() to service_role;
