-- Fase 1: agenda Google Calendar + turnos
-- Ejecutar en el SQL Editor de Supabase (después del schema base)

-- Flags en businesses
alter table businesses
  add column if not exists agenda_habilitada boolean not null default false;

alter table businesses
  add column if not exists requiere_sena boolean not null default false;

alter table businesses
  add column if not exists alias_cbu text;

alter table businesses
  add column if not exists instrucciones_sena text;

-- Catálogo de servicios
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  nombre text not null,
  duracion_minutos int not null default 30 check (duracion_minutos > 0),
  requiere_derivacion_humana boolean not null default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create index if not exists services_business_id_idx on services(business_id);

-- Config de Google Calendar por negocio
create table if not exists business_calendar_config (
  business_id uuid primary key references businesses(id) on delete cascade,
  google_calendar_id text not null default 'primary',
  google_refresh_token text,
  google_account_email text,
  horario_laboral jsonb not null default '{
    "timezone":"America/Argentina/Buenos_Aires",
    "mon":[["09:00","18:00"]],
    "tue":[["09:00","18:00"]],
    "wed":[["09:00","18:00"]],
    "thu":[["09:00","18:00"]],
    "fri":[["09:00","18:00"]],
    "sat":[],
    "sun":[]
  }'::jsonb,
  duracion_default_minutos int not null default 30,
  slot_interval_minutos int not null default 30,
  dias_hacia_adelante int not null default 14,
  minutos_expiracion_pendiente int not null default 30,
  conectado_en timestamptz,
  actualizado_en timestamptz not null default now()
);

-- Turnos / bookings
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  servicio text not null,
  fecha_hora timestamptz not null,
  duracion_minutos int not null check (duracion_minutos > 0),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'cancelado', 'expirado')),
  nombre_cliente text not null,
  telefono_cliente text not null,
  email_cliente text,
  notas text,
  google_event_id text,
  conversation_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_business_estado_idx
  on bookings(business_id, estado, created_at desc);
create index if not exists bookings_business_fecha_idx
  on bookings(business_id, fecha_hora);
create index if not exists bookings_expires_idx
  on bookings(estado, expires_at)
  where estado = 'pendiente';

-- Conversaciones: historial + draft del flujo
alter table conversations
  add column if not exists estado_flujo jsonb not null default '{}'::jsonb;

alter table conversations
  add column if not exists actualizado_en timestamptz not null default now();

-- RLS
alter table services enable row level security;
alter table business_calendar_config enable row level security;
alter table bookings enable row level security;
