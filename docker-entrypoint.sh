#!/bin/sh
set -e

# Auth.js redirects and CSRF break when AUTH_URL points at localhost in production.
if [ -n "$NEXT_PUBLIC_APP_URL" ]; then
  case "${AUTH_URL:-}" in
    ""|*localhost*|*127.0.0.1*)
      export AUTH_URL="$NEXT_PUBLIC_APP_URL"
      export NEXTAUTH_URL="$NEXT_PUBLIC_APP_URL"
      echo "AUTH_URL set from NEXT_PUBLIC_APP_URL: $AUTH_URL"
      ;;
  esac
fi

backfill_branch_scope() {
  echo "Backfilling branch scope on legacy rows..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 <<'SQL' || true
UPDATE "AdminStaff" SET "branchId" = 'branch_gurgaon' WHERE "branchId" IS NULL OR "branchId" = '';
UPDATE "AdminExpense" SET "branchId" = 'branch_gurgaon' WHERE "branchId" IS NULL;
UPDATE "AdminMrdRequest" SET "branchId" = 'branch_gurgaon' WHERE "branchId" IS NULL;
UPDATE "Patient" SET "tenantId" = 'tenant_navayu', "branchId" = 'branch_gurgaon' WHERE "tenantId" IS NULL OR "branchId" IS NULL;
UPDATE "OpdVisit" SET "tenantId" = 'tenant_navayu', "branchId" = 'branch_gurgaon' WHERE "tenantId" IS NULL OR "branchId" IS NULL;
SQL
}

apply_schema() {
  if [ "$PRISMA_DB_PUSH" = "false" ]; then
    echo "Skipping prisma db push (PRISMA_DB_PUSH=false)."
    return 0
  fi

  # Apply one-time raw SQL migration for the IPD schema drift that prisma db push can struggle with
  # on existing Coolify databases (missing wardId/bedId on IpdAdmission, missing tables, etc.).
  if [ -n "$DATABASE_URL" ] && [ -f "/app/prisma/migrate-ipd-schema.sql" ]; then
    echo "Applying IPD schema migration SQL..."
    npx prisma db execute --schema /app/prisma/schema.prisma --file /app/prisma/migrate-ipd-schema.sql || echo "WARNING: IPD schema migration SQL failed or partially applied."
  fi

  attempt=1
  accept_flag="--accept-data-loss"
  if [ "$PRISMA_ACCEPT_DATA_LOSS" = "false" ]; then
    accept_flag=""
  else
    echo "WARNING: applying schema with --accept-data-loss. Set PRISMA_ACCEPT_DATA_LOSS=false to disable."
  fi
  while [ "$attempt" -le 5 ]; do
    if npx prisma db push --skip-generate $accept_flag; then
      return 0
    fi
    echo "WARNING: prisma db push failed (attempt ${attempt}/5) — retrying in 3s..."
    attempt=$((attempt + 1))
    sleep 3
  done
  echo "WARNING: prisma db push failed after retries — app will start but workspace loads may fail until schema is synced."
  return 1
}

if [ -n "$DATABASE_URL" ]; then
  echo "Applying database schema..."
  apply_schema || true
  backfill_branch_scope
  if [ "$RUN_DB_SEED" = "true" ]; then
    echo "WARNING: RUN_DB_SEED=true wipes all patients, visits, and sessions before re-seeding."
    echo "Seeding database..."
    npx prisma db seed || echo "Seed skipped or failed (non-fatal)."
  fi
  if [ -n "$ADMIN_BOOTSTRAP_PASSWORD" ]; then
    echo "Ensuring admin login from ADMIN_BOOTSTRAP_PASSWORD..."
    ADMIN_PASSWORD="$ADMIN_BOOTSTRAP_PASSWORD" node scripts/seed-admin-only.mjs || echo "Admin bootstrap skipped or failed."
  fi
else
  echo "WARNING: DATABASE_URL is not set — skipping database setup."
fi

exec "$@"
