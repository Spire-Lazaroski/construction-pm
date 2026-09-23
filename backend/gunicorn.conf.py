# Loaded automatically by gunicorn from the working directory (Railway runs from backend/).
# The Excel import (workbook + ~20 PDFs to Supabase Storage) can take longer than
# gunicorn's default 30 s, after which the worker is killed and the browser gets a 500.
import os

timeout = int(os.environ.get("GUNICORN_TIMEOUT", "180"))
graceful_timeout = 30
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))  # one slow import doesn't block other users
worker_class = "gthread"
accesslog = "-"
