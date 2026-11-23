-- Lista Londra: da eseguire UNA volta in Supabase > SQL Editor > New query > Run.
-- PRIMA sostituisci le due email qui sotto con le vostre.
-- Non caricare su GitHub questo file dopo averci scritto le email.

-- 1. Chi può entrare -----------------------------------------------------------
create table if not exists public.coppia (email text primary key);
insert into public.coppia (email) values
  ('tua.email@esempio.it'),
  ('email.di.lei@esempio.it')
on conflict do nothing;
alter table public.coppia enable row level security;   -- nessuno la legge dalla pagina

create or replace function public.is_coppia() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coppia
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2. Lista delle cose da fare ---------------------------------------------------
create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  text          text not null check (char_length(text) between 1 and 200),
  cat           text not null default 'altro',
  done          boolean not null default false,
  done_at       timestamptz,
  done_by       uuid,
  done_by_name  text,
  added_by      uuid default auth.uid(),
  added_by_name text,
  owner         uuid,          -- per la valigia: di chi è la voce (vuoto = in comune)
  created_at    timestamptz not null default now()
);
alter table public.items add column if not exists owner uuid;

-- 3. Biglietti ------------------------------------------------------------------
create table if not exists public.tickets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  date          date,
  time          text,
  note          text,
  path          text not null,
  content_type  text,
  file_name     text,
  added_by      uuid default auth.uid(),
  added_by_name text,
  created_at    timestamptz not null default now()
);

-- I nuovi progetti Supabase non danno permessi automatici sulle tabelle:
-- li diamo solo agli utenti collegati (il filtro vero lo fanno le regole sotto).
grant select, insert, update, delete on public.items   to authenticated;
grant select, insert, update, delete on public.tickets to authenticated;

alter table public.items   enable row level security;
alter table public.tickets enable row level security;

drop policy if exists "solo la coppia" on public.items;
create policy "solo la coppia" on public.items
  for all to authenticated using (public.is_coppia()) with check (public.is_coppia());

drop policy if exists "solo la coppia" on public.tickets;
create policy "solo la coppia" on public.tickets
  for all to authenticated using (public.is_coppia()) with check (public.is_coppia());

-- 3b. Itinerario e altre info del viaggio (i contenuti si inseriscono a parte,
--     così non finiscono nel repository pubblico)
create table if not exists public.trip_info (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.trip_info to authenticated;
alter table public.trip_info enable row level security;
drop policy if exists "solo la coppia" on public.trip_info;
create policy "solo la coppia" on public.trip_info
  for all to authenticated using (public.is_coppia()) with check (public.is_coppia());

-- 4. Aggiornamenti in tempo reale -------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null; end $$;

-- 5. Spazio privato per i file dei biglietti (max 20 MB, foto e PDF) ---------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('biglietti', 'biglietti', false, 20971520,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "biglietti leggi"   on storage.objects;
drop policy if exists "biglietti carica"  on storage.objects;
drop policy if exists "biglietti elimina" on storage.objects;
create policy "biglietti leggi" on storage.objects
  for select to authenticated using (bucket_id = 'biglietti' and public.is_coppia());
create policy "biglietti carica" on storage.objects
  for insert to authenticated with check (bucket_id = 'biglietti' and public.is_coppia());
create policy "biglietti elimina" on storage.objects
  for delete to authenticated using (bucket_id = 'biglietti' and public.is_coppia());
