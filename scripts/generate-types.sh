#!/usr/bin/env bash
#
# Regenerate packages/data/src/generated/database.types.ts from the migrations.
#
#   ./scripts/generate-types.sh
#
# Deliberately does NOT talk to the hosted project. `supabase gen types
# --db-url "$SUPABASE_DB_URL"` needs the database password, which means the
# types can only be refreshed by whoever holds it — and a checked-in file that
# only one person can regenerate goes stale.
#
# The migrations are the source of truth for the schema, so this applies them to
# a throwaway cluster (the same one supabase/tests/run.sh uses) and reads the
# types off that. Anyone with a Postgres install can run it, the output is
# identical to what the hosted project would produce, and if it is NOT
# identical, the hosted project has drifted from the migrations — which is
# something you want to find out.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/.."
MIGRATIONS="$ROOT/supabase/migrations"
OUT="$ROOT/packages/data/src/generated/database.types.ts"
PORT="${PGTEST_PORT:-55433}"

PGBIN="${PGBIN:-}"
if [[ -z "$PGBIN" ]]; then
  for candidate in /opt/homebrew/Cellar/postgresql@*/*/bin /usr/lib/postgresql/*/bin; do
    [[ -x "$candidate/initdb" ]] && PGBIN="$candidate"
  done
fi
if [[ -z "$PGBIN" || ! -x "$PGBIN/initdb" ]]; then
  echo "Could not find Postgres server binaries. Set PGBIN to the directory holding initdb." >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
cleanup() {
  "$PGBIN/pg_ctl" -D "$WORKDIR/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$WORKDIR/data" -U postgres --auth=trust >"$WORKDIR/initdb.log" 2>&1
"$PGBIN/pg_ctl" -D "$WORKDIR/data" \
  -o "-p $PORT -h 127.0.0.1 -k $WORKDIR" \
  -l "$WORKDIR/pg.log" start >/dev/null

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres
psql() { "$PGBIN/psql" -v ON_ERROR_STOP=1 -q "$@"; }

psql -d postgres -c "create database relayflow" >/dev/null
export PGDATABASE=relayflow

psql -f "$ROOT/supabase/tests/00_local_auth_shim.sql" >/dev/null
for file in "$MIGRATIONS"/*.sql; do
  psql -f "$file" >/dev/null
done

echo "  schema applied, reading the catalog…"
"$PGBIN/psql" -t -A -X -v ON_ERROR_STOP=1 -f "$HERE/introspect.sql" >"$WORKDIR/catalog.json"

node "$HERE/generate-types.mjs" <"$WORKDIR/catalog.json" >"$WORKDIR/database.types.ts"
npx --yes prettier --write "$WORKDIR/database.types.ts" >/dev/null 2>&1 || true
mv "$WORKDIR/database.types.ts" "$OUT"

echo "  wrote $(wc -l <"$OUT" | tr -d ' ') lines to packages/data/src/generated/database.types.ts"
