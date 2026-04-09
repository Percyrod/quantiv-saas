-- ============================================================
-- QUANTIV — Schema de base de datos en Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Tabla de simulaciones guardadas
create table if not exists public.simulations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  params      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Índice para consultas por usuario
create index if not exists simulations_user_id_idx on public.simulations(user_id);

-- Row Level Security: cada usuario solo ve sus propias simulaciones
alter table public.simulations enable row level security;

create policy "Users can view own simulations"
  on public.simulations for select
  using (auth.uid() = user_id);

create policy "Users can insert own simulations"
  on public.simulations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own simulations"
  on public.simulations for update
  using (auth.uid() = user_id);

create policy "Users can delete own simulations"
  on public.simulations for delete
  using (auth.uid() = user_id);

-- Trigger para actualizar updated_at automáticamente
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger simulations_updated_at
  before update on public.simulations
  for each row execute procedure public.handle_updated_at();
