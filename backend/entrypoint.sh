#!/bin/sh
set -eu

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Despliegue de demostración: carga datos ficticios (no duplica si ya están).
if [ "${DEMO_SEED:-0}" = "1" ]; then
  python manage.py preparar_demo
fi

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers ${GUNICORN_WORKERS:-4} \
  --timeout ${GUNICORN_TIMEOUT:-120} \
  --access-logfile - \
  --error-logfile -
