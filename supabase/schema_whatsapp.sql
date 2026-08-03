-- WhatsApp Cloud API — conexiones por negocio
-- TODAVÍA NO EJECUTAR en producción hasta que quieras activar el canal.
-- Cuando estés listo: pegá esto en el SQL Editor de Supabase.

-- Mapea phone_number_id (Meta) → business_id + token de acceso
create table if not exists whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  phone_number_id text not null unique,
  business_id uuid not null references businesses(id) on delete cascade,
  access_token text not null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_connections_business_id_idx
  on whatsapp_connections(business_id);

alter table whatsapp_connections enable row level security;

-- Ejemplo de fila (reemplazá los valores):
-- insert into whatsapp_connections (phone_number_id, business_id, access_token)
-- values (
--   '123456789012345',                              -- Phone number ID de Meta
--   '00000000-0000-0000-0000-000000000000',         -- UUID del negocio
--   'EAAxxxx...'                                    -- Permanent / System User token
-- );
