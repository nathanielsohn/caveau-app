/**
 * Staff-accessible admin routes.
 *
 * Most /admin surfaces are admin-only. A small set is intentionally available
 * to staff operators, and middleware + layout both use this helper so they
 * cannot drift apart.
 */
export function isStaffAdminPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin/hurricane") ||
    pathname.startsWith("/admin/waitlist") ||
    /^\/admin\/migrations\/[^/]+\/export$/.test(pathname)
  );
}
