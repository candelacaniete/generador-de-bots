# Generador de chatbots (Next.js + Supabase)

App web para crear chatbots con IA a partir de un PDF/Word del negocio. Multi-tenant desde el día 1. Incluye **reserva de turnos con Google Calendar** (fase 1, seña manual).

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres + pgvector)
- **Anthropic Claude** (`claude-haiku-4-5-20251001`) para respuestas + tool calling
- **OpenAI** (`text-embedding-3-small`) para embeddings
- **Google Calendar API** (OAuth del dueño del negocio)
- Extracción PDF con **unpdf**

## Setup

1. Ejecutá en Supabase SQL Editor:
   - `supabase/schema.sql`
   - `supabase/schema_bookings.sql`
2. Copiá `.env.example` → `.env.local` (o variables en Vercel).
3. En [Google Cloud Console](https://console.cloud.google.com/):
   - Creá un OAuth Client ID (Web)
   - Authorized redirect URI: `https://TU-DOMINIO/api/google/oauth/callback`
   - Scopes: Calendar + email
4. `npm install && npm run dev`

## Agenda (fase 1)

En `/bot/[business_id]`:

1. **Conectar Google Calendar** (OAuth)
2. Activar agenda, definir servicios, alias/CBU si hay seña
3. El bot ofrece horarios reales, crea eventos `PENDIENTE` en Calendar
4. Confirmá/cancelá turnos desde la tabla de la misma página
5. Cron cada 10 min expira pendientes y libera el slot (`/api/cron/expire-bookings`)

Reglas del bot:

- Teléfono obligatorio, email opcional
- Ofrece 3–4 slots concretos (ventana 7 días; si no hay, el próximo en 14)
- Sin slots → deriva a humano
- Obra social / servicio con flag → deriva (no agenda automático)

## Persistencia de chat

El widget guarda `conversation_id` en `localStorage` y rehidrata el historial al reabrir la burbuja.

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/upload` | Crear bot desde PDF/DOCX |
| `POST` | `/api/chat` | Chat RAG + tools de agenda (`conversation_id` opcional) |
| `GET` | `/api/conversations` | Rehidratar historial |
| `GET` | `/api/widget/[business_id]` | Script embebible |
| `GET` | `/api/google/oauth/start` | Iniciar OAuth |
| `GET/PUT` | `/api/agenda/config` | Config agenda/servicios |
| `GET/POST` | `/api/bookings` | Listar / confirmar / cancelar |
| `GET` | `/api/cron/expire-bookings` | Expirar pendientes |
