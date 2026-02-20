# UE Active Authors (Presence) Extension

Adobe App Builder project for the **Universal Editor Properties Rail** – **Active Authors** panel only. Shows who is currently editing content in the Universal Editor.

**Extension point:** `universal-editor/ui/1`  
**Extension ID:** `agentic-how-to-presence`

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Adobe I/O CLI](https://developer.adobe.com/app-builder/docs/guides/getting_started_firefly/#prerequisites): `npm install -g @adobe/aio-cli`
- [Supabase](https://supabase.com/) project for presence and nicknames

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

Run the migration scripts against your Supabase project:

- `scripts/supabase-presence-migration.sql`
- `scripts/supabase-nicknames-migration.sql`
- `scripts/supabase-presence-identity-migration.sql`

### 3. Configure `.env`

Create `.env` with:

```bash
# Adobe I/O Runtime
AIO_runtime_auth=<your-runtime-auth>
AIO_runtime_namespace=<your-namespace>
AIO_runtime_apihost=https://adobeioruntime.net

# Supabase
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

---

## Local development

```bash
aio app run
```

UI runs on `localhost:9080`. For Universal Editor integration, use `?devMode=true&ext=https://localhost:9080` in the UE URL.

---

## Build

```bash
aio app build
```

---

## Deploy

```bash
aio app deploy
```

After deployment, register the extension in AEM Extension Manager for the Universal Editor.
