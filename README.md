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
| Vercel | `VITE_API_URL` | Railway backend `/api` URL. |
| Vercel | `VITE_CESIUM_ION_TOKEN` | Optional — enables the 3D site view. |
| Vercel | `VITE_FEATURE_CRM` | `1` shows the parked CRM screens (sales, customers, follow-ups). Hidden by default. |

## Notes

- UI in Macedonian and English (switch in the top bar). Numbers `143.500,00`, dates `dd.mm.yyyy`.
- All money is stored in EUR; the EUR/MKD switch changes display only (fixed 61,5 MKD = 1 EUR).
  Invoices can be entered in MKD — the original amount is kept and converted to EUR.
- Cost rule: each position's budget is its **own** amount; a parent's total = own + sub-positions (same as the Excel).
- Deleting a position is a soft delete with Undo; everything is in the audit trail ("History").
- Excel import: *Import from Excel* in the sidebar. Upload the Gantt workbook (+ invoice PDFs), review the
  problems found, then import as a new project or into an existing one (positions matched by code).
- Authentication is token-based (no roles yet — planned: Admin / Project manager / Site-Viewer).
- Document uploads use Supabase Storage in production (`USE_SUPABASE_STORAGE=1`).
- Planning docs: `docs/`.
