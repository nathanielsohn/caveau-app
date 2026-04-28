import { describe, expect, it } from "vitest";
import { isStaffAdminPath } from "../admin-routes";

describe("isStaffAdminPath", () => {
  it("allows the explicit staff admin surfaces", () => {
    expect(isStaffAdminPath("/admin/hurricane")).toBe(true);
    expect(isStaffAdminPath("/admin/hurricane/protocol-1")).toBe(true);
    expect(isStaffAdminPath("/admin/waitlist")).toBe(true);
    expect(isStaffAdminPath("/admin/waitlist/export")).toBe(true);
    expect(isStaffAdminPath("/admin/migrations/550e8400-e29b-41d4-a716-446655440000/export")).toBe(true);
  });

  it("keeps the rest of /admin admin-only", () => {
    expect(isStaffAdminPath("/admin")).toBe(false);
    expect(isStaffAdminPath("/admin/members")).toBe(false);
    expect(isStaffAdminPath("/admin/facilities")).toBe(false);
    expect(isStaffAdminPath("/admin/migrations")).toBe(false);
  });
});
