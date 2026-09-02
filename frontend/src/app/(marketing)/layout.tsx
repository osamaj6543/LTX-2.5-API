import Link from "next/link";
import { Clapperboard } from "lucide-react";

import { Button } from "@/components/ui/button";

const FOOTER_YEAR = new Date().getFullYear();

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Public header */}
      <header className="glass sticky top-0 z-30 border-b border-border/50">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="bg-brand-gradient flex size-8 items-center justify-center rounded-lg text-white">
              <Clapperboard className="size-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">LTX Studio</span>
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">Video platform</span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <Link href="/#features" className="transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="/#why" className="transition-colors hover:text-foreground">
              Why LTX
            </Link>
            <Link href="/#faq" className="transition-colors hover:text-foreground">
              FAQ
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <Link href="/studio">
              <Button variant="gradient" size="sm" className="gap-1.5">
                Open Studio
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Public footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {FOOTER_YEAR} LTX Studio — self-hosted AI video generation</p>
          <nav className="flex items-center gap-5">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/studio" className="transition-colors hover:text-foreground">
              Studio
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
