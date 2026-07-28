# Generador de chatbots (Next.js + Supabase)

App web para crear chatbots con IA a partir de un PDF/Word del negocio. Multi-tenant desde el día 1. Incluye **reserva de turnos con Google Calendar** (fase 1, seña manual).

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres + pgvector + Auth magic link)
- **Anthropic Claude** (`claude-haiku-4-5-20251001`) para respuestas
- **OpenAI** (`text-embedding-3-small`) para embeddings
- **Google Calendar API** (OAuth del dueño del negocio)
- **Resend** (emails al confirmar turno)
- Extracción PDF con **unpdf**

## Setup

1. Ejecutá en Supabase SQL Editor:
   - `supabase/schema.sql`
   - `supabase/schema_bookings.sql`
   - `supabase/schema_auth.sql`
2. En Supabase → Authentication → Providers: Email habilitado (magic link / OTP).
3. Supabase → Authentication → URL Configuration:
   - **Site URL:** `https://generador-de-bots.vercel.app` (NO localhost)
   - **Redirect URLs:** `https://generador-de-bots.vercel.app/auth/callback`
4. Copiá `.env.example` → `.env.local` (o variables en Vercel).  
   Importantes: `next_public_supabase_anon_key`, `admin_emails`, `resend_api_key`
   (también acepta MAYÚSCULAS).  
   `next_public_app_url` debe ser `https://generador-de-bots.vercel.app` (si queda en localhost, el magic link rompe).
5. En [Google Cloud Console](https://console.cloud.google.com/):
   - OAuth Client ID (Web)
   - Redirect: `https://TU-DOMINIO/api/google/oauth/callback`
6. `npm install && npm run dev`

## Roles y rutas

| Ruta | Quién |
|------|--------|
| `/panel/[id]` | Dueño del negocio (magic link; email = `owner_email` o member) |
| `/bot/[id]` | Solo admin (`ADMIN_EMAILS`) — snippet WordPress |
| `/admin` | Solo admin — lista negocios, genera links de onboarding |
| `/nuevo` | Solo admin — crear bot desde PDF |
| `/onboarding/[token]` | Público, un solo uso |
| `/login` | Magic link |

Migración de paneles ya compartidos: cargá el email del cliente en Configuración → **Email de acceso al panel**. El UUID sigue siendo la URL, pero ahora pide login.

## Agenda

1. El negocio entra a `/panel/[id]` con magic link
2. Conecta Google Calendar, servicios, color, emails
3. El bot ofrece horarios, pide confirmación de datos, re-valida el slot y crea `PENDIENTE`
4. Confirmá/cancelá desde Turnos → emails vía Resend
5. PWA: instalar desde el panel (Android) o “Agregar a inicio” (iPhone)

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/upload` | Crear bot desde PDF/DOCX (admin) |
| `POST` | `/api/chat` | Chat RAG + orquestador de turnos |
| `GET` | `/api/widget/[business_id]` | Script embebible (público) |
| `GET/PUT` | `/api/agenda/config` | Config (auth panel) |
| `GET/POST` | `/api/bookings` | Listar / confirmar / cancelar (auth panel) |
| `POST` | `/api/admin/onboarding-tokens` | Crear link onboarding (admin) |
| `GET/POST` | `/api/onboarding/[token]` | Form público |
| `GET` | `/api/cron/expire-bookings` | Expirar pendientes |
