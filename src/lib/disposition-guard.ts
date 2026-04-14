export type DispositionWine = { id: string; status: string } | null;

export class DispositionGuardError extends Error {
  code: "not_found" | "already_disposed";
  constructor(code: "not_found" | "already_disposed", message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Throws if the wine cannot be disposed: missing (or not owned, since the
 * caller must scope the lookup by member) or already in a non-cellar state.
 * The string messages match the legacy thrown errors so existing callers
 * keep their public behavior.
 */
export function assertCanDispose(wine: DispositionWine): asserts wine is {
  id: string;
  status: string;
} {
  if (!wine) {
    throw new DispositionGuardError("not_found", "Not found");
  }
  if (wine.status !== "in_cellar") {
    throw new DispositionGuardError("already_disposed", "Wine already disposed");
  }
}
