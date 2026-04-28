import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Role } from "@prisma/client";
import AdminNav from "@/components/admin-nav";
import { getServerAuth } from "@/lib/auth";
import { isStaffAdminPath } from "@/lib/admin-routes";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Middleware already gates /admin, but we double-check in the layout so a
  // misconfigured middleware (or future bypass via a hook) cannot leak admin
  // views. Staff are allowed only on the explicit operator paths.
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const pathname = (await headers()).get("x-pathname") ?? "";
  const canAccess =
    session.user.role === Role.admin ||
    (session.user.role === Role.staff && isStaffAdminPath(pathname));
  if (!canAccess) redirect("/");

  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
