import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import Nav from "@/components/nav";
import Providers from "@/components/providers";
import { getServerAuth } from "@/lib/auth";
import {
  getCurrentFacility,
  getMemberFacilities,
} from "@/lib/current-facility";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Caveau — Wine Cellar Management",
  description:
    "Luxury wine cellar management with IoT monitoring and provenance certificates",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Best-effort facility context for the nav switcher. Errors (no session,
  // unmigrated DB) collapse to an empty list — the nav still renders.
  let facilities: Awaited<ReturnType<typeof getMemberFacilities>> = [];
  let currentFacilityId: string | null = null;
  try {
    const session = await getServerAuth();
    if (session?.user?.id) {
      facilities = await getMemberFacilities(session.user.id);
      const current = await getCurrentFacility(session.user.id);
      currentFacilityId = current?.id ?? null;
    }
  } catch {
    // swallow — layout must never throw
  }

  return (
    <html lang="en" className="dark">
      <body
        className={`${playfair.variable} ${inter.variable} font-sans bg-caveau-black text-primary min-h-screen`}
      >
        <Providers>
          <Nav
            facilities={facilities}
            currentFacilityId={currentFacilityId}
          />
          {/* md:ml-56 offsets for the desktop sidebar; pb-20 gives space for mobile bottom tabs */}
          <main className="md:ml-56 pb-20 md:pb-0 min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
