-- Auth + panel members + brand color + onboarding + notificaciones
-- Ejecutar en el SQL Editor de Supabase (después de schema.sql y schema_bookings.sql)

-- Email del dueño (claim del panel vía magic link)
alter table businesses
  add column if not exists owner_email text;

-- Aviso de turnos confirmados (negocio)
alter table businesses
  add column if not exists email_notificaciones text;

-- Color del widget
alter table businesses
  add column if not exists color_primario text not null default '#2563eb';

-- Precio opcional en servicios (onboarding / FAQ)
alter table services
  add column if not exists precio text;

-- Miembros del panel (Supabase Auth user ↔ negocio)
create table if not exists business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  rol text not null default 'owner'
    check (rol in ('owner', 'staff', 'admin_interno')),
  creado_en timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists business_members_user_idx on business_members(user_id);
create index if not exists business_members_business_idx on business_members(business_id);
create index if not exists businesses_owner_email_idx on businesses(owner_email);

alter table business_members enable row level security;

-- Tokens de onboarding (un solo uso, no adivinables)
create table if not exists onboarding_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  creado_en timestamptz not null default now(),
  expires_at timestamptz not null,
  usado_en timestamptz,
  business_id uuid references businesses(id) on delete set null,
  nota text
);

create index if not exists onboarding_tokens_token_idx on onboarding_tokens(token);

alter table onboarding_tokens enable row level security;
