from pathlib import Path
import os
from datetime import timedelta
from urllib.parse import urlparse
from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is None:
        return default
    if isinstance(value, str) and value.strip() == "":
        return default
    return value


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = env(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def env_int(name: str, default: int) -> int:
    value = env(name, str(default))
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def env_optional(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    return value.strip()


def _normalize_host(raw: str) -> str:
    candidate = raw.strip()
    if not candidate:
        return ""
    if "://" in candidate:
        parsed = urlparse(candidate)
        candidate = parsed.hostname or ""
    else:
        # Remove an optional :port suffix if provided without scheme.
        candidate = candidate.split(":", 1)[0]
    return candidate.strip().strip("[]")


def hosts_from_coolify() -> list[str]:
    raw = env("SERVICE_FQDN_NGINX", "")
    values = [v.strip() for v in raw.split(",") if v.strip()]
    hosts = [_normalize_host(v) for v in values]
    return [h for h in hosts if h]


def origins_from_coolify() -> list[str]:
    raw = env("SERVICE_FQDN_NGINX", "")
    values = [v.strip() for v in raw.split(",") if v.strip()]
    origins: list[str] = []
    for value in values:
        if "://" in value:
            parsed = urlparse(value)
            if parsed.scheme and parsed.hostname:
                origins.append(f"{parsed.scheme}://{parsed.hostname}")
        else:
            host = _normalize_host(value)
            if host:
                origins.append(f"https://{host}")
    return origins


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def hosts_from_railway() -> list[str]:
    values = [
        env_optional("RAILWAY_PUBLIC_DOMAIN"),
        env_optional("RAILWAY_PRIVATE_DOMAIN"),
    ]
    hosts = [_normalize_host(value) for value in values if value]
    return _unique([host for host in hosts if host])


def origins_from_railway() -> list[str]:
    values = [
        env_optional("RAILWAY_PUBLIC_DOMAIN"),
    ]
    origins: list[str] = []
    for value in values:
        if not value:
            continue
        if "://" in value:
            parsed = urlparse(value)
            if parsed.scheme and parsed.hostname:
                origins.append(f"{parsed.scheme}://{parsed.hostname}")
        else:
            host = _normalize_host(value)
            if host:
                origins.append(f"https://{host}")
    return _unique(origins)


def origins_from_urls(*names: str) -> list[str]:
    origins: list[str] = []
    for name in names:
        value = env_optional(name)
        if not value:
            continue
        if "://" in value:
            parsed = urlparse(value)
            if parsed.scheme and parsed.hostname:
                origins.append(f"{parsed.scheme}://{parsed.hostname}")
        else:
            host = _normalize_host(value)
            if host:
                origins.append(f"https://{host}")
    return _unique(origins)


def postgres_connection_from_env() -> dict[str, str]:
    # Explicit vars have priority; URL is used as fallback when provided.
    db_name = env_optional("POSTGRES_DB")
    db_user = env_optional("POSTGRES_USER")
    db_password = env_optional("POSTGRES_PASSWORD")
    db_host = env("POSTGRES_HOST", "localhost").strip()
    db_port = env("POSTGRES_PORT", "5432").strip()

    url_candidate = env_optional("DATABASE_URL") or env_optional("POSTGRES_URL")
    if not url_candidate and "://" in db_host:
        url_candidate = db_host

    if url_candidate and "://" in url_candidate:
        parsed = urlparse(url_candidate)
        if parsed.hostname:
            db_host = parsed.hostname
        if parsed.port:
            db_port = str(parsed.port)
        if not db_user and parsed.username:
            db_user = parsed.username
        if not db_password and parsed.password:
            db_password = parsed.password
        if not db_name and parsed.path:
            db_name = parsed.path.lstrip("/")
    else:
        # Supports POSTGRES_HOST like "host:5432".
        if db_host.count(":") == 1 and "://" not in db_host:
            host_part, port_part = db_host.split(":", 1)
            if host_part.strip() and port_part.strip().isdigit():
                db_host = host_part.strip()
                db_port = port_part.strip()

    return {
        "NAME": db_name or "lista_espera_ccr",
        "USER": db_user or "postgres",
        "PASSWORD": db_password or "postgres",
        "HOST": db_host or "localhost",
        "PORT": db_port or "5432",
    }


DJANGO_ENV = env("DJANGO_ENV", "development").lower()
IS_PRODUCTION = env_bool("DJANGO_PRODUCTION", DJANGO_ENV in {"prod", "production"})

SECRET_KEY = env("DJANGO_SECRET_KEY", "replace-me")
DEBUG = env_bool("DJANGO_DEBUG", not IS_PRODUCTION)
allowed_hosts_default = "localhost,127.0.0.1"
if IS_PRODUCTION:
    deployment_hosts = _unique(hosts_from_coolify() + hosts_from_railway())
    if deployment_hosts:
        allowed_hosts_default = ",".join(deployment_hosts)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", allowed_hosts_default)

csrf_default = "http://localhost,http://127.0.0.1"
if IS_PRODUCTION:
    deployment_origins = _unique(
        origins_from_coolify()
        + origins_from_railway()
        + origins_from_urls("FRONTEND_PUBLIC_URL", "NEXT_PUBLIC_APP_URL")
    )
    if deployment_origins:
        csrf_default = ",".join(deployment_origins)
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", csrf_default)
ENABLE_DJANGO_ADMIN = env_bool("DJANGO_ENABLE_ADMIN", not IS_PRODUCTION)

if IS_PRODUCTION and SECRET_KEY in {"", "replace-me"}:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY insegura para producción.")
if IS_PRODUCTION and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS debe definirse en producción.")
if IS_PRODUCTION and DEBUG:
    raise ImproperlyConfigured("DEBUG debe ser False en producción.")
if IS_PRODUCTION and not CSRF_TRUSTED_ORIGINS:
    raise ImproperlyConfigured("DJANGO_CSRF_TRUSTED_ORIGINS debe definirse en producción.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "apps.usuarios",
    "apps.pacientes",
    "apps.importar",
    "apps.reportes",
    "rest_framework_simplejwt",
]

MIDDLEWARE = [
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
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DB_ENGINE = env("DJANGO_DB_ENGINE", "sqlite").lower()

if DB_ENGINE == "postgres":
    pg = postgres_connection_from_env()
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": pg["NAME"],
            "USER": pg["USER"],
            "PASSWORD": pg["PASSWORD"],
            "HOST": pg["HOST"],
            "PORT": pg["PORT"],
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": env("SQLITE_PATH", str(BASE_DIR / "db.sqlite3")),
        }
    }

CACHE_BACKEND = env("DJANGO_CACHE_BACKEND", "locmem").lower()

if CACHE_BACKEND == "redis":
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": f"redis://{env('REDIS_HOST', 'localhost')}:{env('REDIS_PORT', '6379')}/1",
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
        }
    }
    SESSION_ENGINE = "django.contrib.sessions.backends.cache"
    SESSION_CACHE_ALIAS = "default"
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "lista-espera-ccr-dev",
        }
    }
    SESSION_ENGINE = "django.contrib.sessions.backends.db"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "es-cl"
TIME_ZONE = "America/Santiago"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Seguridad HTTP/HTTPS
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = env(
    "DJANGO_SECURE_REFERRER_POLICY", "strict-origin-when-cross-origin"
)
X_FRAME_OPTIONS = env("DJANGO_X_FRAME_OPTIONS", "DENY")

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = env_bool("DJANGO_SESSION_COOKIE_SECURE", IS_PRODUCTION)
SESSION_COOKIE_SAMESITE = env("DJANGO_SESSION_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_SECURE = env_bool("DJANGO_CSRF_COOKIE_SECURE", IS_PRODUCTION)
CSRF_COOKIE_SAMESITE = env("DJANGO_CSRF_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_HTTPONLY = env_bool("DJANGO_CSRF_COOKIE_HTTPONLY", False)

SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", IS_PRODUCTION)
SECURE_HSTS_SECONDS = env_int(
    "DJANGO_SECURE_HSTS_SECONDS", 31536000 if IS_PRODUCTION else 0
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", IS_PRODUCTION
)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", False)

if IS_PRODUCTION:
    if not SECURE_SSL_REDIRECT:
        raise ImproperlyConfigured("DJANGO_SECURE_SSL_REDIRECT debe ser True en producción.")
    if not SESSION_COOKIE_SECURE:
        raise ImproperlyConfigured("DJANGO_SESSION_COOKIE_SECURE debe ser True en producción.")
    if not CSRF_COOKIE_SECURE:
        raise ImproperlyConfigured("DJANGO_CSRF_COOKIE_SECURE debe ser True en producción.")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "usuarios.Usuario"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        *(
            ["rest_framework.authentication.SessionAuthentication"]
            if DEBUG
            else []
        ),
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("DRF_THROTTLE_ANON", "60/minute"),
        "user": env("DRF_THROTTLE_USER", "300/minute"),
        "auth_login": env("DRF_THROTTLE_AUTH_LOGIN", "10/minute"),
        "auth_refresh": env("DRF_THROTTLE_AUTH_REFRESH", "20/minute"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=env_int("JWT_ACCESS_MINUTES", 20 if IS_PRODUCTION else 30)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=env_int("JWT_REFRESH_DAYS", 7 if IS_PRODUCTION else 14)
    ),
    "AUTH_HEADER_TYPES": ("Bearer",),
}
