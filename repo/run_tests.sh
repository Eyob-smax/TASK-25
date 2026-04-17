#!/usr/bin/env bash
# GreenCycle API — Docker-first test runner
#
# Runs backend unit tests and API/integration tests inside Docker.
# This script is the canonical entry point for CI and local verification.
#
# Usage:
#   chmod +x run_tests.sh
#   ./run_tests.sh
#
# Steps:
#   1. Build the backend Docker image
#   2. Apply Prisma migrations against the test database
#   3. Run unit tests (no DB dependency — pure functions and schema validation)
#   4. Run API/integration tests (Fastify inject, requires migrated test DB)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TEST_DB_URL="file:/app/database/test.db"

echo "========================================="
echo " GreenCycle API — Test Suite"
echo "========================================="

# 1. Build test image
echo "[1/4] Building test image..."
docker compose -f docker-compose.yml build backend

# 2. Apply Prisma migrations to test database
echo "[2/4] Applying Prisma migrations to test database..."
docker compose run --rm --no-deps \
  -e NODE_ENV=test \
  -e DATABASE_URL="${TEST_DB_URL}" \
  backend \
  npx prisma migrate deploy

# 3. Run unit tests (pure functions — no DB required)
echo "[3/4] Running unit tests..."
docker compose run --rm --no-deps \
  -e NODE_ENV=test \
  -e DATABASE_URL="${TEST_DB_URL}" \
  backend \
  npx vitest run --config vitest.unit.config.ts

# 4. Run API/integration tests (requires migrated DB)
echo "[4/4] Running API/integration tests..."
docker compose run --rm --no-deps \
  -e NODE_ENV=test \
  -e DATABASE_URL="${TEST_DB_URL}" \
  backend \
  npx vitest run --config vitest.api.config.ts

echo "========================================="
echo " All tests passed."
echo "========================================="
