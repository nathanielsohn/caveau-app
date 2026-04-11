import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import Nav from "@/components/nav";
import Providers from "@/components/providers";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${playfair.variable} ${inter.variable} font-sans bg-caveau-black text-primary min-h-screen`}
      >
        <Providers>
          <Nav />
          {/* md:ml-56 offsets for the desktop sidebar; pb-20 gives space for mobile bottom tabs */}
          <main className="md:ml-56 pb-20 md:pb-0 min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
