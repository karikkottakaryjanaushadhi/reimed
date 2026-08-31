#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: npm run db:backup [-- extra pg_dump args]
       bash scripts/db-backup.sh [--supabase] [--from-env] [-- OUTFILE.sql]

Options:
  --supabase   Use DIRECT_URL from .env that points at Supabase (commented lines ok)
  --from-env   Load DIRECT_URL from .env when not already set in the shell
  --           Pass remaining args to pg_dump (before output file)

Environment:
  DIRECT_URL           Postgres direct connection (required unless --from-env / --supabase)
  SUPABASE_DIRECT_URL  Overrides DIRECT_URL when set

Output:
  backups/reimed-YYYYMMDD-HHMMSS.sql  (or path given after --)
EOF
}

read_env_direct_url() {
  local prefer_supabase="${1:-0}"
  local line url
  if [[ ! -f .env ]]; then
    echo "No .env file in $ROOT" >&2
    exit 1
  fi
  if [[ "$prefer_supabase" == "1" ]]; then
    line="$(grep -E '^#?DIRECT_URL=.*supabase' .env | tail -1 || true)"
  else
    line="$(grep -E '^DIRECT_URL=' .env | grep -v '^#' | tail -1 || true)"
  fi
  if [[ -z "$line" ]]; then
    echo "Could not find DIRECT_URL in .env" >&2
    exit 1
  fi
  url="${line#*DIRECT_URL=}"
  url="${url#\"}"
  url="${url%\"}"
  url="${url#\'}"
  url="${url%\'}"
  printf '%s' "$url"
}

FROM_ENV=0
PREFER_SUPABASE=0
PG_DUMP_ARGS=()
OUTFILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --supabase)
      PREFER_SUPABASE=1
      FROM_ENV=1
      shift
      ;;
    --from-env)
      FROM_ENV=1
      shift
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        if [[ -z "$OUTFILE" && "$1" == *.sql ]]; then
          OUTFILE="$1"
        else
          PG_DUMP_ARGS+=("$1")
        fi
        shift
      done
      break
      ;;
    *)
      if [[ -z "$OUTFILE" && "$1" == *.sql ]]; then
        OUTFILE="$1"
      else
        PG_DUMP_ARGS+=("$1")
      fi
      shift
      ;;
  esac
done

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install PostgreSQL client tools." >&2
  exit 1
fi

DB_URL="${SUPABASE_DIRECT_URL:-${DIRECT_URL:-}}"
if [[ -z "$DB_URL" && "$FROM_ENV" == "1" ]]; then
  DB_URL="$(read_env_direct_url "$PREFER_SUPABASE")"
fi
if [[ -z "$DB_URL" ]]; then
  echo "Set DIRECT_URL (or SUPABASE_DIRECT_URL), or run with --from-env / --supabase." >&2
  usage >&2
  exit 1
fi

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTFILE="${OUTFILE:-backups/reimed-${STAMP}.sql}"

echo "Backing up to $OUTFILE ..."
pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  "${PG_DUMP_ARGS[@]}" \
  -f "$OUTFILE"

ls -lh "$OUTFILE"
echo "Done. Restore with: psql \"\$DIRECT_URL\" -f $OUTFILE"
