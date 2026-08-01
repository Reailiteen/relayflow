#!/usr/bin/env bash
#
# Apply every migration to a throwaway Postgres cluster and assert the
# invariants that matter. No Docker, no hosted project, no network.
#
#   ./supabase/tests/run.sh
#
# The cluster lives in a temp directory and is destroyed on exit, so this is
# safe to run repeatedly and safe to run in CI.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
PORT="${PGTEST_PORT:-55432}"

# Homebrew keeps the server binaries out of PATH when only libpq is linked.
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
# TCP rather than a unix socket: socket paths are capped at ~103 bytes and a
# temp directory blows straight past it.
"$PGBIN/pg_ctl" -D "$WORKDIR/data" \
  -o "-p $PORT -h 127.0.0.1 -k $WORKDIR" \
  -l "$WORKDIR/pg.log" start >/dev/null

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres
psql() { "$PGBIN/psql" -v ON_ERROR_STOP=1 -q "$@"; }

psql -d postgres -c "create database relayflow" >/dev/null
export PGDATABASE=relayflow

psql -f "$HERE/00_local_auth_shim.sql"

for file in "$MIGRATIONS"/*.sql; do
  printf '  applying %s\n' "$(basename "$file")"
  psql -f "$file"
done

for test_file in "$HERE"/[0-9][0-9]_*.sql; do
  [[ "$(basename "$test_file")" == "00_local_auth_shim.sql" ]] && continue
  "$PGBIN/psql" -v ON_ERROR_STOP=1 -f "$test_file" 2>&1 \
    | sed 's/^psql:.*NOTICE: *//'
done

echo ""
echo "schema OK"
