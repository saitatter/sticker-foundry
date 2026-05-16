#!/bin/sh
set -eu

POSTGRES_DB="${POSTGRES_DB:-stickers}"
POSTGRES_USER="${POSTGRES_USER:-stickers}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-stickers}"
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/data/postgres}"
DATA_DIR="${DATA_DIR:-/data/app}"
EXPORT_CACHE_DIR="${EXPORT_CACHE_DIR:-$DATA_DIR/export-cache}"
BACKGROUND_REMOVAL_COMMAND="${BACKGROUND_REMOVAL_COMMAND:-rembg i {input} {output}}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/15/bin}"

database_url() {
  node -e 'const [user, password, db] = process.argv.slice(1); console.log(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:5432/${encodeURIComponent(db)}?schema=public`);' "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$POSTGRES_DB"
}

DATABASE_URL="${DATABASE_URL:-$(database_url)}"

export BACKGROUND_REMOVAL_COMMAND
export DATABASE_URL
export DATA_DIR
export EXPORT_CACHE_DIR
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"
export U2NET_HOME="${U2NET_HOME:-/data/rembg-models}"

postgres_pid=""
backend_pid=""
nginx_pid=""

stop_services() {
  if [ -n "$nginx_pid" ] && kill -0 "$nginx_pid" 2>/dev/null; then
    nginx -s quit >/dev/null 2>&1 || kill "$nginx_pid" 2>/dev/null || true
  fi

  if [ -n "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  if [ -n "$postgres_pid" ] || [ -s "$POSTGRES_DATA_DIR/postmaster.pid" ]; then
    su postgres -c "\"$PG_BIN/pg_ctl\" -D \"$POSTGRES_DATA_DIR\" -m fast -w stop" >/dev/null 2>&1 || true
  fi
}

trap 'stop_services; exit 143' INT TERM

sql_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

sql_identifier() {
  printf "%s" "$1" | sed 's/"/""/g'
}

POSTGRES_USER_SQL="$(sql_literal "$POSTGRES_USER")"
POSTGRES_DB_SQL="$(sql_literal "$POSTGRES_DB")"
POSTGRES_PASSWORD_SQL="$(sql_literal "$POSTGRES_PASSWORD")"
POSTGRES_USER_IDENT="$(sql_identifier "$POSTGRES_USER")"
POSTGRES_DB_IDENT="$(sql_identifier "$POSTGRES_DB")"

mkdir -p "$DATA_DIR" "$EXPORT_CACHE_DIR" "$POSTGRES_DATA_DIR" "$U2NET_HOME" /run/postgresql
chown -R postgres:postgres "$POSTGRES_DATA_DIR" /run/postgresql

if [ ! -s "$POSTGRES_DATA_DIR/PG_VERSION" ]; then
  su postgres -c "\"$PG_BIN/initdb\" -D \"$POSTGRES_DATA_DIR\" --username=postgres --auth-local=trust --auth-host=scram-sha-256"
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "password_encryption = 'scram-sha-256'"
  } >> "$POSTGRES_DATA_DIR/postgresql.conf"
  echo "host all all 127.0.0.1/32 scram-sha-256" >> "$POSTGRES_DATA_DIR/pg_hba.conf"
fi

su postgres -c "\"$PG_BIN/pg_ctl\" -D \"$POSTGRES_DATA_DIR\" -o '-c listen_addresses=127.0.0.1' -w start"
postgres_pid="$(head -n 1 "$POSTGRES_DATA_DIR/postmaster.pid" 2>/dev/null || true)"

if ! printf "SELECT 1 FROM pg_roles WHERE rolname='%s';\n" "$POSTGRES_USER_SQL" | su postgres -c "psql -d postgres -tA" | grep -q 1; then
  printf "CREATE ROLE \"%s\" LOGIN;\n" "$POSTGRES_USER_IDENT" | su postgres -c "psql -d postgres"
fi

printf "ALTER ROLE \"%s\" WITH PASSWORD '%s';\n" "$POSTGRES_USER_IDENT" "$POSTGRES_PASSWORD_SQL" | su postgres -c "psql -d postgres"

if ! printf "SELECT 1 FROM pg_database WHERE datname='%s';\n" "$POSTGRES_DB_SQL" | su postgres -c "psql -d postgres -tA" | grep -q 1; then
  printf "CREATE DATABASE \"%s\" OWNER \"%s\";\n" "$POSTGRES_DB_IDENT" "$POSTGRES_USER_IDENT" | su postgres -c "psql -d postgres"
fi

cd /app/apps/backend
npx prisma migrate deploy
node dist/main.js &
backend_pid="$!"

nginx -g "daemon off;" &
nginx_pid="$!"

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 2
done

stop_services
exit 1
