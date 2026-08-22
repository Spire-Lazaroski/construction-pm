# Construction PM

Django + DRF backend, React (Vite) + Tailwind frontend, Supabase Postgres + Storage,
deployed on Railway (backend) + Vercel (frontend).

## Setup (local dev)

Backend:
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL etc.
python manage.py makemigrations core
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Frontend:
```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:8000/api
npm run dev
```

## Deployment

Backend → Railway (needs a persistent process, unlike Vercel). Set env vars matching
`.env.example`, start command `gunicorn config.wsgi --bind 0.0.0.0:$PORT`, and after
first deploy run `python manage.py migrate` via Railway's shell.

Frontend → Vercel, root directory `frontend`, env var `VITE_API_URL` pointing at the
Railway backend's `/api` path.

Then set `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` on Railway to the real
Vercel URL, and `CSRF_TRUSTED_ORIGINS` should also include the Railway URL itself
(needed for `/admin/` to work).

## Notes

- Authentication is token-based (any Django `User` can log in — no role separation yet).
- All money is stored in EUR; the header's EUR/MKD toggle (fixed rate 61.5 MKD = 1 EUR)
  only changes display formatting.
- Task edits/deletes are tracked in an audit trail (visible via "History" on each task row).
- Document uploads use Supabase Storage in production (`USE_SUPABASE_STORAGE=1`) — local
  disk storage is used only when that's unset, and does not survive redeploys on Railway.
