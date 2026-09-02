"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  Clapperboard,
  FolderKanban,
  Home,
  Library,
  Menu,
  Monitor,
  Moon,
  Plug,
  Search,
  Server,
  Settings2,
  Sun,
  Wand2,
  X,
} from "lucide-react";

import { getHealthDetails } from "@/lib/api/endpoints";
import { useSettings } from "@/lib/store/settings";
import { SettingsDialog } from "@/components/settings-dialog";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV_SECTIONS = [
  {
    label: "Create",
    items: [
      { href: "/dashboard", label: "Home", icon: Home },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/studio", label: "Generate", icon: Wand2 },
      { href: "/jobs", label: "Library", icon: Library },
    ],
  },
  {
    label: "Platform",
    items: [{ href: "/admin", label: "Server console", icon: Server }],
  },
];

function usePageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Home";
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/studio")) return "Generate";
  if (pathname.startsWith("/jobs")) return "Library";
  if (pathname.startsWith("/admin")) return "Server console";
  if (pathname.startsWith("/setup")) return "Get started";
  return "LTX Studio";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageTitle = usePageTitle(pathname);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  /* Global ⌘K / Ctrl+K */
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeAll = () => {
    setMobileOpen(false);
    setPaletteOpen(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-sidebar/60 backdrop-blur-xl lg:flex">
        <SidebarContent
          pathname={pathname}
          onOpenSettings={() => setSettingsOpen(true)}
          onNavigate={closeAll}
        />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Top bar */}
        <header className="glass sticky top-0 z-30 border-b border-border/50">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            {/* Mobile nav */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarContent
                  pathname={pathname}
                  onOpenSettings={() => {
                    setMobileOpen(false);
                    setSettingsOpen(true);
                  }}
                  onNavigate={closeAll}
                />
              </SheetContent>
            </Sheet>

            <h1 className="truncate text-sm font-semibold tracking-tight">{pageTitle}</h1>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-lg border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground sm:flex"
              >
                <Search className="size-3.5 shrink-0" />
                Search
                <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
                  Ctrl K
                </kbd>
              </button>
              <UserMenu onOpenSettings={() => setSettingsOpen(true)} />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border/50 py-5">
          <div className="flex flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
            <p>LTX Studio — professional video generation platform</p>
            <p className="flex items-center gap-1.5">
              <Monitor className="size-3" />
              Powered by LTX-2.5 · Next.js · Tailwind · shadcn/ui
            </p>
          </div>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
function SidebarContent({
  pathname,
  onOpenSettings,
  onNavigate,
}: {
  pathname: string;
  onOpenSettings: () => void;
  onNavigate: () => void;
}) {
  const { apiKey } = useSettings();
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b px-5">
        <span className="bg-brand-gradient flex size-8 items-center justify-center rounded-lg text-white">
          <Clapperboard className="size-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">LTX Studio</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Video platform</p>
        </div>
      </div>

      {/* Workspace switcher */}
      <div className="border-b px-3 py-3">
        <ProjectSwitcher onNavigate={onNavigate} />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-slim">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {section.label}
            </p>
            <div className="grid gap-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground")} />
                    {item.label}
                    {active && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                  </Link>
                );
              })}
              {section.label === "Platform" && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <Plug className="size-4 text-muted-foreground/70 group-hover:text-foreground" />
                  Connection
                  {!apiKey && <span className="ml-auto size-1.5 rounded-full bg-amber-500" />}
                </button>
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Server status */}
      <div className="border-t p-3">
        <ServerStatusCard />
      </div>
    </div>
  );
}

function ServerStatusCard() {
  const { baseUrl } = useSettings();
  const { data: details } = useQuery({
    queryKey: ["admin", "health-details"],
    queryFn: () => getHealthDetails(),
    retry: false,
    refetchInterval: 30_000,
  });

  const { data: health, isError } = useQuery({
    queryKey: ["health", baseUrl],
    queryFn: () =>
      fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { cache: "no-store" }).then(
        (r) => r.json() as Promise<{ status: string; version: string }>
      ),
    refetchInterval: 15_000,
    retry: false,
  });

  const online = !!health && !isError;
  const gpu = details?.gpus?.find((g) => g.available);
  const vramPct = gpu?.memory_total_mb ? Math.round(((gpu.memory_used_mb ?? 0) / gpu.memory_total_mb) * 100) : null;

  return (
    <div className="rounded-xl border bg-card/80 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <span className={cn("size-1.5 rounded-full", online ? "animate-pulse-soft bg-emerald-500" : "bg-red-500")} />
          {online ? "Server online" : "Server unreachable"}
        </p>
        {health?.version && <span className="text-[10px] text-muted-foreground">v{health.version}</span>}
      </div>
      {gpu ? (
        <div className="mt-2.5">
          <p className="truncate text-[11px] text-muted-foreground">{gpu.name}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", vramPct && vramPct > 90 ? "bg-amber-500" : "bg-emerald-500")}
              style={{ width: `${vramPct ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">VRAM {vramPct}% used</p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {online ? "No GPU reported" : "Check the connection settings"}
        </p>
      )}
    </div>
  );
}
function UserMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { theme, setTheme } = useTheme();
  const { apiKey } = useSettings();
  const initial = apiKey ? "U" : "—";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex size-8 items-center justify-center rounded-full border bg-card text-xs font-semibold transition-colors hover:border-primary/40"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">
          {apiKey ? "Connected · API key active" : "No API key set"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOpenSettings}>
          <Plug /> Connection settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CommandPalette({
  open,
  onOpenChange,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenSettings: () => void;
}) {
  const router = useRouter();
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={run(() => router.push("/dashboard"))}>
            <Home /> Home
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/projects"))}>
            <FolderKanban /> Projects
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/studio"))}>
            <Wand2 /> Generate video
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/jobs"))}>
            <Library /> Library
          </CommandItem>
          <CommandItem onSelect={run(() => router.push("/admin"))}>
            <Server /> Server console
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(onOpenSettings)}>
            <Settings2 /> Connection settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}



