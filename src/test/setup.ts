/**
 * Vitest setup file. Imported once before any test runs.
 *
 * Wires the env validator's escape hatch on so importing src/lib/env.ts in
 * tests doesn't blow up looking for DATABASE_URL or NEXTAUTH_SECRET. Tests
 * that exercise the env module directly should set the variables themselves.
 */
process.env.SKIP_ENV_VALIDATION = "true";
process.env.NEXTAUTH_SECRET = "test-secret-value-for-vitest-only";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
