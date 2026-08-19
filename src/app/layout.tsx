import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yassin's League - Tournament Manager",
  description:
    "Run a football-style league and knockout tournament: round-robin standings, fixtures and a Champions-League-inspired bracket.",
};

export const viewport: Viewport = {
  themeColor: "#04081c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="pitch-backdrop pitch-lines antialiased">{children}</body>
    </html>
  );
}
