import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-secret-key-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

# Needed for /admin/ (session + CSRF based) to work behind Railway/Vercel/any host
# that isn't localhost. Set as a comma-separated list of full origins, e.g.
# "https://construction-pm-production.up.railway.app,https://myapp.vercel.app"
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()
]

# Railway (and most PaaS hosts) terminate HTTPS at their edge and forward to the app
# over plain HTTP internally. Without this, Django doesn't realize the original
# request was secure, which breaks CSRF/cookie checks. Harmless locally — this header
# is only set by a real proxy, so local dev is unaffected.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "storages",
    "core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --- Database ---
# Preferred: set DATABASE_URL to your Supabase connection string (Project Settings -> Database
# -> Connection string -> "URI", use the pooler/6543 URI if deploying to a serverless target,
# the direct/5432 URI if your host keeps a long-lived process, e.g. Railway/Render/Fly).
# Falls back to discrete DB_* vars (useful for local Postgres) if DATABASE_URL isn't set.
DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    import dj_database_url
    DATABASES = {
        "default": dj_database_url.parse(DATABASE_URL, conn_max_age=600, ssl_require=True)
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DB_NAME", "construction_pm"),
            "USER": os.environ.get("DB_USER", "postgres"),
            "PASSWORD": os.environ.get("DB_PASSWORD", "postgres"),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
        }
    }

# Django's default logging config drops INFO-level messages to the console when
# DEBUG=False (production) — which is exactly why earlier diagnostic log lines never
# showed up in Railway's Deploy Logs. This forces everything to stdout unconditionally.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 100,
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# --- CORS: allow the Vite dev server + whatever you deploy the frontend to ---
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
CORS_ALLOW_ALL_ORIGINS = os.environ.get("CORS_ALLOW_ALL", "0") == "1"

# --- File storage: Supabase Storage (S3-compatible) in production, local disk in dev ---
# Supabase gives you an S3-compatible endpoint per project:
#   https://<project-ref>.supabase.co/storage/v1/s3
# Create a bucket (e.g. "documents"), then set these env vars to route uploads there.
USE_SUPABASE_STORAGE = os.environ.get("USE_SUPABASE_STORAGE", "0") == "1"

if USE_SUPABASE_STORAGE:
    STORAGES = {
        "default": {"BACKEND": "core.storage.SupabasePublicStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
    AWS_ACCESS_KEY_ID = os.environ.get("SUPABASE_S3_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.environ.get("SUPABASE_S3_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = os.environ.get("SUPABASE_S3_BUCKET", "documents")
    AWS_S3_ENDPOINT_URL = os.environ.get("SUPABASE_S3_ENDPOINT_URL")  # https://<ref>.supabase.co/storage/v1/s3
    AWS_S3_REGION_NAME = os.environ.get("SUPABASE_S3_REGION", "us-east-1")
    AWS_S3_ADDRESSING_STYLE = "path"
    AWS_DEFAULT_ACL = None
    # Reads use SupabasePublicStorage.url() below, not S3 presigned URLs — Supabase's
    # S3-compatible endpoint doesn't reliably support the signing scheme boto3 falls
    # back to. This is the actual public link format Supabase serves files at.
    SUPABASE_PUBLIC_URL_BASE = (
        AWS_S3_ENDPOINT_URL.replace("/storage/v1/s3", "/storage/v1/object/public")
        if AWS_S3_ENDPOINT_URL else None
    )
else:
    MEDIA_URL = "media/"
    MEDIA_ROOT = BASE_DIR / "media"
