-- Generador de chatbots — schema multi-tenant
-- Ejecutar en el SQL Editor de Supabase

create extension if not exists vector;

-- Negocios (tenants)
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text unique not null,
  creado_en timestamptz not null default now()
);

-- Documentos subidos por cada negocio
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  nombre_archivo text not null,
  texto_extraido text not null,
  subido_en timestamptz not null default now()
);

create index if not exists documents_business_id_idx on documents(business_id);

-- Fragmentos con embeddings (pgvector)
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  contenido text not null,
  embedding vector(1536),
  creado_en timestamptz not null default now()
);

create index if not exists document_chunks_business_id_idx on document_chunks(business_id);
create index if not exists document_chunks_document_id_idx on document_chunks(document_id);

-- Índice HNSW para búsqueda por similitud coseno
create index if not exists document_chunks_embedding_idx
  on document_chunks
  using hnsw (embedding vector_cosine_ops);

-- Conversaciones (opcional, para después)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  mensajes jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists conversations_business_id_idx on conversations(business_id);

-- RLS: la app usa solo service_role en el servidor (bypassea RLS).
-- Sin policies públicas, anon/authenticated no pueden leer ni escribir.
alter table businesses enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table conversations enable row level security;

-- Función RPC: busca los chunks más relevantes por negocio
create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_business_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  business_id uuid,
  contenido text,
  similarity float
)
language sql
stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.business_id,
    dc.contenido,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.business_id = match_business_id
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- Permitir ejecutar la RPC desde la API
grant execute on function match_document_chunks(vector, uuid, int) to service_role;
grant execute on function match_document_chunks(vector, uuid, int) to anon;
grant execute on function match_document_chunks(vector, uuid, int) to authenticated;
