# Construction PM — United Build Group

Django + DRF backend, React (Vite) + Tailwind frontend, Supabase Postgres + Storage,
deployed on Railway (backend) + Vercel (frontend).

## Setup (local dev)

Backend:
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # set DJANGO_DEBUG=1 for local work
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Frontend:
```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:8000/api
npm run dev
```

Tests (backend):
```bash
cd backend
DJANGO_DEBUG=1 DATABASE_URL=sqlite:///test.sqlite3 python manage.py test core
# with the real sample workbook + PDFs:
SAMPLE_DIR=../../Sample DJANGO_DEBUG=1 DATABASE_URL=sqlite:///test.sqlite3 python manage.py test core
```

## Environment variables

| Where | Variable | Notes |
|---|---|---|
| Railway | `DJANGO_SECRET_KEY` | **Required** when `DJANGO_DEBUG` is not `1` — the app refuses to start without it. |
| Railway | `DJANGO_DEBUG` | Leave unset (= off) in production. `1` only for local dev. |
| Railway | `DJANGO_ALLOWED_HOSTS` | Comma-separated. Default when not debugging: `localhost,127.0.0.1,.railway.app`. Add a custom domain here. |
| Railway | `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | The Vercel URL (and the Railway URL for `/admin/`). |
| Railway | `MAX_UPLOAD_MB` | Upload limit, default 25. |
| Railway | `DOCUMENT_LINK_TTL` | Seconds a document link stays valid (presigned URL), default 3600. |
| Railway | `SUPABASE_PUBLIC_URLS` | Leave unset. `1` only as a fallback if the bucket is public again (permanent links). |
| Vercel | `VITE_API_URL` | Railway backend `/api` URL. |
| Vercel | `VITE_CESIUM_ION_TOKEN` | Optional — enables the 3D site view. |
| Vercel | `VITE_FEATURE_CRM` | `1` shows the parked CRM screens (sales, customers, follow-ups). Hidden by default. |
| Vercel | `VITE_FEATURE_ECONOMICS` | `1` shows *Economics* (units with design vs geodetic m², landowner compensation, margin, cost per m²) and *Fixed costs* (monthly company/site costs shared by budget). Hidden by default. |

## Notes

- UI in Macedonian and English (switch in the top bar). Numbers `143.500,00`, dates `dd.mm.yyyy`.
- All money is stored in EUR; the EUR/MKD switch changes display only (fixed 61,5 MKD = 1 EUR).
  Invoices can be entered in MKD — the original amount is kept and converted to EUR.
- Cost rule: each position's budget is its **own** amount; a parent's total = own + sub-positions (same as the Excel).
- Deleting a position is a soft delete with Undo; everything is in the audit trail ("History").
- Excel import: *Import from Excel* in the sidebar. Upload the Gantt workbook (+ invoice PDFs), review the
  problems found, then import as a new project or into an existing one (positions matched by code).
- Authentication is token-based (no roles yet — planned: Admin / Project manager / Site-Viewer).
- Document uploads use Supabase Storage in production (`USE_SUPABASE_STORAGE=1`). The `documents` bucket must be
  **private**; the API hands out presigned links that expire (`DOCUMENT_LINK_TTL`).
- The app does not use Supabase's Data API. Migration `0011` (and a post-migrate hook for later tables) enables RLS and revokes `anon`/`authenticated`
  access on all tables; keep it that way (Supabase Advisors → Security should show no RLS errors).
- Actual cost of a position = the sum of its invoices (no manual field). Payments are separate records
  (`/api/payments/`), so partial payments keep their date and history; an invoice's paid amount is derived.
- Planning docs: `docs/`.

## Backups

The free Supabase plan has no usable backups, so `.github/workflows/backup.yml` runs every night (and on demand:
Actions → *Nightly backup* → *Run workflow*). It dumps the app's data (schema `public`) and, if the S3 secrets are
set, the document files, then **encrypts** everything (the repository is public) and keeps it 30 days as a workflow
artifact. The secrets it needs are listed at the top of the workflow file. **Keep a copy of `BACKUP_PASSPHRASE`
outside GitHub**: without it the backups cannot be opened.

Restore (into an empty database, e.g. a new Supabase project):
```bash
gpg --decrypt backup-2026-10-12.tar.gz.gpg | tar -xzf -
pg_restore --no-owner --no-privileges -d "$DATABASE_URL" backup/database.dump
python manage.py migrate
```
`migrate` afterwards re-applies the Data API lockdown. Document files are in `backup/files/`; upload them to the
new bucket with the same paths (`aws s3 sync backup/files s3://documents --endpoint-url …`).
