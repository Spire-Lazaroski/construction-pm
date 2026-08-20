# Construction PM

Django + DRF backend, React (Vite) + Tailwind frontend, Supabase Postgres + Storage.

## Architecture recap

- **Setup** — create project, define the construction process as user-defined tasks
  (name, estimated dates, estimated cost, dependencies), manage vendors, customers, units.
- **Gantt & Calendar** — estimate vs actual bars per task, red/amber/green health, zoom
  day/week/month/quarter/year. Click any task to open its detail panel: log actuals,
  upload documents, log issues.
- **Financials** — read-only reporting: cumulative cost vs revenue (break-even chart),
  per-period actual-vs-estimate table at the same zoom granularities.
- **Operational** — the daily-driver tab: "Today / This Week" feed (overdue/upcoming
  customer payments, vendor bills, tasks starting soon, open issues) plus manual
  follow-ups linked to tasks/vendors/customers, unit sales with payment tracking and
  document uploads, and vendor payables with a "mark paid" flow.

All monetary values are stored in **EUR** as the base currency. A EUR/MKD toggle in the
header (fixed rate 61.5 MKD = 1 EUR) changes the *display* everywhere at once.

Marking a customer's final installment paid automatically flips the sale agreement to
"completed" and the unit to "sold" — that status is then consistent everywhere the unit
appears (Setup, Operational, Financials totals).

## Authentication

The API requires a login token on every request (`IsAuthenticated` is the default
permission). The frontend shows a sign-in screen until a valid token is stored.

- There's no public sign-up — accounts are created by whoever runs the Django admin.
- Any Django `User` can log in, staff or not — there are no roles/permissions tiers yet
  (everyone who can log in can see and edit everything). That's a known simplification;
  ask if you want role-based access before opening this up to more people.
- To add a teammate: `/admin/` → Users → Add user → give them a username/password.
  They do **not** need "staff" or "superuser" checked to use the app itself — only to
  access `/admin/`.

## 1. Supabase setup (recommended DB + file storage)
1. Create a project at supabase.com (free tier: 500MB DB, 1GB storage — plenty for
   this app's rows plus ~50 PDFs/project).
2. **Database**: Project Settings → Database → Connection string → URI. Copy it into
   `backend/.env` as `DATABASE_URL`. Use the *Session pooler* URI (port 5432, IPv4-safe)
   unless your network can reach the direct IPv6-only host.
3. **Storage**: Storage → Create bucket → name it `documents`. Then get an S3-compatible
   access key pair (Storage → S3 Access Keys), and set `USE_SUPABASE_STORAGE=1` plus the
   `SUPABASE_S3_*` vars in `.env`. Required before deploying — local disk storage is
   wiped on every redeploy on Railway/Render.
4. Local dev without Supabase is still possible — leave `DATABASE_URL` unset and fill in
   `DB_*` for a local Postgres instead.

## 2. Backend (local dev)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL etc.
python manage.py makemigrations core
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## 3. Frontend (local dev)

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:8000/api
npm run dev
```
Open `http://localhost:5173`, sign in with the superuser you just created.

## 4. Deploying — Backend on Railway

Django needs a persistent process, which Vercel doesn't provide, so the backend goes on
Railway (or Render/Fly — same idea).

1. railway.app → New Project → Deploy from GitHub repo → select this repo
2. In the service settings, set **Root Directory** to `backend`
3. Add environment variables (Settings → Variables) — same as `backend/.env.example`,
   but with production values:
   ```
   DJANGO_SECRET_KEY=<generate a real random value — do not reuse the dev default>
   DJANGO_DEBUG=0
   DJANGO_ALLOWED_HOSTS=<your-app>.up.railway.app
   DATABASE_URL=<your Supabase pooler string>
   USE_SUPABASE_STORAGE=1
   SUPABASE_S3_ACCESS_KEY_ID=...
   SUPABASE_S3_SECRET_ACCESS_KEY=...
   SUPABASE_S3_BUCKET=documents
   SUPABASE_S3_ENDPOINT_URL=https://<ref>.supabase.co/storage/v1/s3
   CORS_ALLOWED_ORIGINS=https://<your-frontend>.vercel.app
   ```
4. Settings → Deploy → Start Command:
   ```
   gunicorn config.wsgi --bind 0.0.0.0:$PORT
   ```
5. Deploy. Once live, open a shell (Railway's "..." menu) and run:
   ```
   python manage.py migrate
   python manage.py createsuperuser
   ```
6. Note the public URL Railway gives you (e.g. `https://construction-pm-production.up.railway.app`) — you'll need it for the frontend.

## 5. Deploying — Frontend on Vercel

1. vercel.com → Add New Project → import this repo
2. Set **Root Directory** to `frontend` (framework preset auto-detects as Vite)
3. Environment variable:
   ```
   VITE_API_URL=https://<your-railway-backend>.up.railway.app/api
   ```
4. Deploy. You'll get a URL like `https://construction-pm.vercel.app`
5. Go back to Railway and set `CORS_ALLOWED_ORIGINS` to that exact Vercel URL, then
   redeploy the backend so it accepts requests from it.

The app uses `HashRouter` (URLs look like `.../#/gantt`), so no extra Vercel rewrite
rules are needed for client-side routing to work.

## 6. Sharing with a teammate before going fully public

- Create them a `User` in `/admin/` (see Authentication above) rather than sharing your
  own login.
- The current setup has no role separation — anyone who can log in can see and edit
  everything (all projects, all financials). Fine for a small trusted team; flag if you
  want per-project or per-role restrictions before wider rollout.

## 7. What's scaffolded vs. what's next

Done: full data model, REST API with an analytics/break-even endpoint and an
operational feed endpoint, all 4 pages wired to real API calls, token-based login,
EUR/MKD currency toggle, transaction-safe payment completion logic.

Sensible next increments: role-based permissions (not just "logged in or not"),
automated tests, drag-to-reschedule on the Gantt bars, a dependency-arrow overlay
(data model already supports `predecessors`), rate limiting, and monitoring/backups
once this is handling real data for real people.
