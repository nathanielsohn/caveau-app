/**
 * Regression test for commit 50e4368 — the "disposed wines leak back into
 * the unassigned picker" bug. The fix added `status: "in_cellar"` to
 * getUnassignedWines in src/app/locker/page.tsx.
 *
 * `getUnassignedWines` is a private function inside a Server Component
 * file (src/app/locker/page.tsx) that contains JSX, so we can't import
 * and execute it from a vitest test without a JSX transformer in the
 * test environment. Instead, this file does targeted source-code
 * assertions: read the page module, isolate the helper's body, and
 * assert the audit-relevant filters are present. If anyone deletes
 * `status: "in_cellar"` from that query, exactly one test here fails
 * with a name that points straight at the broken filter.
 *
 * Static assertions are weaker than runtime mocks (a refactor that
 * renames `getUnassignedWines` to something else will need this test
 * updated) but they are stronger than nothing — and they cost zero infra.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const LOCKER_PAGE_PATH = resolve(__dirname, "../../app/locker/page.tsx");
const COLLECTION_CLIENT_PATH = resolve(
  __dirname,
  "../../app/collection/collection-client.tsx",
);

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Slice out the body of a top-level function declaration by name. Naive
 * brace-counting parser — good enough for the small handful of helpers
 * we want to assert against.
 */
function functionBody(source: string, fnName: string): string {
  const match = source.match(new RegExp(`function\\s+${fnName}\\b`));
  if (!match || match.index == null) {
    throw new Error(`function ${fnName} not found in source`);
  }
  const start = source.indexOf("{", match.index);
  if (start === -1) throw new Error(`opening brace for ${fnName} not found`);
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${fnName}`);
}

describe("getUnassignedWines (locker page) status filter", () => {
  const source = readSource(LOCKER_PAGE_PATH);
  const body = functionBody(source, "getUnassignedWines");

  it("filters by status: in_cellar so disposed wines never reappear", () => {
    expect(body).toMatch(/status\s*:\s*["']in_cellar["']/);
  });

  it("only returns wines with no locker slot assignment", () => {
    expect(body).toMatch(/lockerSlots\s*:\s*\{\s*none\s*:\s*\{\s*\}\s*\}/);
  });

  it("scopes to the authenticated memberId argument", () => {
    expect(body).toMatch(/memberId/);
  });

  it("calls prisma.wine.findMany (sanity check that we slice the right helper)", () => {
    expect(body).toMatch(/prisma\.wine\.findMany/);
  });
});

describe("collection client status filter", () => {
  const source = readSource(COLLECTION_CLIENT_PATH);

  it("filters wines by in_cellar status before rendering the cards", () => {
    // The `cellar` view should only show in_cellar wines; if the filter
    // is removed the disposed wines reappear in the main grid.
    expect(source).toMatch(/status\s*===\s*["']in_cellar["']/);
  });
});
