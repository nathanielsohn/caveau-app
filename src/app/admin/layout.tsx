import { redirect } from "next/navigation";
import AdminNav from "@/components/admin-nav";
import { getServerAuth } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Middleware already gates /admin to role=admin, but we double-check in
  // the layout so a misconfigured middleware (or future bypass via a hook)
  // can't leak staff views to non-admins.
  const session = await getServerAuth();
  if (session?.user?.role !== "admin") redirect("/");

  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
