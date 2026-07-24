# Generador de chatbots (Next.js + Supabase)

App web para crear chatbots con IA a partir de un PDF/Word del negocio. Multi-tenant desde el día 1.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres + pgvector)
- **Anthropic Claude** (`claude-haiku-4-5-20251001`) para respuestas
- **OpenAI** (`text-embedding-3-small`) para embeddings (Anthropic no ofrece embeddings)

## Setup

1. Creá un proyecto en [Supabase](https://supabase.com) y ejecutá el SQL de `supabase/schema.sql` en el SQL Editor.
2. Copiá `.env.example` a `.env.local` y completá las claves:

```bash
cp .env.example .env.local
```

3. Instalá e iniciá:

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Flujo

1. `/nuevo` — nombre del negocio + subida de `.docx`/`.pdf`
2. Backend: extrae texto → chunking (~500 tokens) → embeddings → guarda en Supabase
3. `/bot/[business_id]` — preview del chat + descarga del snippet JS embebible
4. `POST /api/chat` — RAG con similitud coseno (pgvector) + Claude

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/upload` | FormData: `nombre`, `archivo` |
| `POST` | `/api/chat` | JSON: `{ business_id, mensaje }` |
| `GET`  | `/api/widget/[business_id]` | Descarga el `.js` standalone |

## Snippet WordPress

Descargá el script desde la página del bot y pegalo antes de `</body>`:

```html
<script src="https://tu-dominio.com/ruta/al/chatbot.js"></script>
```

El archivo es vanilla JS autocontenido (CSS + UI) con el `business_id` hardcodeado.
