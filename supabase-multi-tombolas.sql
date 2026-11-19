-- Migration multi-tombolas pour le projet Felicity Solar Distribution.
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor sur la base existante.

create extension if not exists pgcrypto;

create table if not exists public.tombolas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived', 'replaced')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  draw_started_at timestamptz
);

-- Horodatage du lancement pour synchroniser l’animation publique avec l’administration.
alter table public.tombolas add column if not exists draw_started_at timestamptz;

-- Crée une campagne active pour rattacher les données déjà présentes.
do $$
declare current_id uuid;
begin
  select id into current_id from public.tombolas where status = 'active' order by created_at desc limit 1;
  if current_id is null then
    insert into public.tombolas(name, status) values ('Tombola initiale', 'active') returning id into current_id;
  end if;

  alter table public.participants add column if not exists campaign_id uuid;
  update public.participants set campaign_id = current_id where campaign_id is null;

  alter table public.draws add column if not exists campaign_id uuid;
  update public.draws d set campaign_id = p.campaign_id
  from public.participants p
  where d.invoice_number = p.invoice_number and d.campaign_id is null;
  update public.draws set campaign_id = current_id where campaign_id is null;
end $$;

-- Les numéros de facture peuvent être réutilisés dans des tombolas différentes.
alter table public.draws drop constraint if exists draws_invoice_number_key;
alter table public.draws drop constraint if exists draws_invoice_number_fkey;
alter table public.participants drop constraint if exists participants_pkey;

alter table public.participants alter column campaign_id set not null;
alter table public.participants add constraint participants_pkey primary key (campaign_id, invoice_number);
alter table public.participants add constraint participants_campaign_fk
  foreign key (campaign_id) references public.tombolas(id) on delete cascade;

alter table public.draws alter column campaign_id set not null;
alter table public.draws add constraint draws_campaign_invoice_unique unique (campaign_id, invoice_number);
alter table public.draws add constraint draws_participant_fk
  foreign key (campaign_id, invoice_number)
  references public.participants(campaign_id, invoice_number) on delete cascade;
alter table public.draws add constraint draws_campaign_fk
  foreign key (campaign_id) references public.tombolas(id) on delete cascade;

create index if not exists participants_campaign_idx on public.participants(campaign_id);
create index if not exists draws_campaign_created_idx on public.draws(campaign_id, created_at desc);
create unique index if not exists tombolas_one_active_idx on public.tombolas(status) where status = 'active';

-- Les tables restent accessibles uniquement par les routes serveur Next.js.
alter table public.tombolas enable row level security;
alter table public.participants enable row level security;
alter table public.draws enable row level security;
revoke all on table public.tombolas, public.participants, public.draws from anon, authenticated;
grant all on table public.tombolas, public.participants, public.draws to service_role;

-- Remplace les anciennes fonctions mono-tombola.
drop function if exists public.draw_next_participant();
drop function if exists public.reset_draws();

create or replace function public.draw_next_participant(p_campaign_id uuid)
returns table (
  invoice_number text,
  customer_name text,
  phone text,
  is_drawn boolean,
  draw_id uuid,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare selected public.participants%rowtype; new_draw_id uuid; new_created_at timestamptz;
begin
  perform pg_advisory_xact_lock(2026111201);
  if not exists (select 1 from public.tombolas where id = p_campaign_id and status = 'active') then
    raise exception 'Cette tombola n’est pas active.';
  end if;
  select * into selected from public.participants p
  where p.campaign_id = p_campaign_id and p.is_drawn = false
  order by random() limit 1 for update skip locked;
  if not found then return; end if;
  update public.participants p set is_drawn = true
  where p.campaign_id = p_campaign_id and p.invoice_number = selected.invoice_number;
  insert into public.draws(campaign_id, invoice_number)
  values (p_campaign_id, selected.invoice_number)
  returning id, draws.created_at into new_draw_id, new_created_at;
  return query select selected.invoice_number, selected.customer_name, selected.phone, true, new_draw_id, new_created_at;
end; $$;

create or replace function public.reset_draws(p_campaign_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  perform pg_advisory_xact_lock(2026111201);
  if not exists (select 1 from public.tombolas where id = p_campaign_id and status = 'active') then
    raise exception 'Cette tombola n’est pas active.';
  end if;
  delete from public.draws where campaign_id = p_campaign_id;
  get diagnostics deleted_count = row_count;
  update public.participants set is_drawn = false where campaign_id = p_campaign_id;
  return deleted_count;
end; $$;

-- Crée une nouvelle tombola. mode='archive' conserve l'ancienne campagne;
-- mode='replace' efface participants et résultats de l'ancienne campagne.
create or replace function public.create_tombola(p_name text, p_mode text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare old_id uuid; new_id uuid; clean_name text;
begin
  perform pg_advisory_xact_lock(2026111201);
  clean_name := nullif(trim(p_name), '');
  if clean_name is null then raise exception 'Le nom de la tombola est obligatoire.'; end if;
  if p_mode not in ('archive', 'replace') then raise exception 'Mode non valide.'; end if;
  select t.id into old_id from public.tombolas t where t.status = 'active' for update;
  if old_id is not null then
    if p_mode = 'archive' then
      update public.tombolas set status = 'archived', closed_at = now() where tombolas.id = old_id;
    else
      delete from public.draws where campaign_id = old_id;
      delete from public.participants where campaign_id = old_id;
      update public.tombolas set status = 'replaced', closed_at = now() where tombolas.id = old_id;
    end if;
  end if;
  insert into public.tombolas(name, status) values (clean_name, 'active') returning tombolas.id into new_id;
  return new_id;
end; $$;

revoke all on function public.draw_next_participant(uuid) from public, anon, authenticated;
revoke all on function public.reset_draws(uuid) from public, anon, authenticated;
revoke all on function public.create_tombola(text, text) from public, anon, authenticated;
grant execute on function public.draw_next_participant(uuid) to service_role;
grant execute on function public.reset_draws(uuid) to service_role;
grant execute on function public.create_tombola(text, text) to service_role;
