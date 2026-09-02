import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import { Providers } from "@/components/providers";

const fontSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fontMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "LTX Studio — AI Video Generation",
    template: "%s · LTX Studio",
  },
  description:
    "Professional web interface for the LTX-2.5 generation API — text-to-video with live progress, queueing and administration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={`${fontSans.variable} ${fontMono.variable} font-sans`}>
        <Providers>
          <div className="relative min-h-screen">
            {/* Ambient background */}
            <div className="pointer-events-none fixed inset-0 -z-10">
              <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_-10%,black,transparent)]" />
              <div className="absolute -top-48 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]" />
            </div>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
