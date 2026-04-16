import { redirect } from "next/navigation";

/**
 * Legacy route — redirects to the renamed /report/[id] path.
 * Keeps old bookmarks and QR codes working.
 */
export default async function CertificateRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/report/${id}`);
}
