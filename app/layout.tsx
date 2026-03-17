import type { Metadata } from "next";
import { Sora, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-sora",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm",
});

export const metadata: Metadata = {
  title: "Fondos Comunes de Inversión IEB S.A.",
  description: "Dashboard de evolución de los Fondos Comunes de Inversión IEB S.A.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sora.variable} ${ibmPlexSans.variable}`}>
      <body>
        <div className="bg-ambient" />
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
