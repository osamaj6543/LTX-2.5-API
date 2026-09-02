import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  AudioLines,
  Check,
  Clapperboard,
  Download,
  Film,
  Images,
  Lock,
  MonitorPlay,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "LTX Studio — Turn your ideas into cinematic AI video",
  description:
    "Type an idea, get a cinematic video with sound. Unlimited HD generations, a personal clip library and complete privacy — LTX Studio runs on your own machine, so your footage stays yours.",
};

/* ------------------------------- content ------------------------------- */

const HERO_STATS = [
  { value: "1080p", label: "full HD output" },
  { value: "30 fps", label: "smooth motion" },
  { value: "~1 min", label: "idea to finished clip" },
  { value: "Unlimited", label: "generations — no credits" },
  { value: "100%", label: "private, on your machine" },
] as const;

const FEATURES = [
  {
    icon: Wand2,
    title: "From words to video",
    description:
      "Type what you imagine — a neon-lit alley in the rain, a perfume bottle drifting through clouds — and watch it become a cinematic clip. No camera, no crew, no editing skills required.",
  },
  {
    icon: Images,
    title: "Bring any photo to life",
    description:
      "Upload a still — a portrait, a product shot, a storyboard frame — add a short prompt, and see it move. Perfect for animating photos or turning sketches into scenes.",
  },
  {
    icon: AudioLines,
    title: "Videos with sound",
    description:
      "Every clip comes with synchronized audio generated alongside the picture — motion and sound designed together, so your video feels finished the moment it renders.",
  },
  {
    icon: Sparkles,
    title: "Prompt assistant built in",
    description:
      "Not sure how to phrase your idea? One toggle automatically turns a few words into a rich, detailed scene description. You stay the director — we handle the vocabulary.",
  },
  {
    icon: Activity,
    title: "Watch it come to life",
    description:
      "See your video being created in real time, stage by stage. Changed your mind mid-render? Cancel instantly and try a different idea — no waiting rooms, no wasted minutes.",
  },
  {
    icon: MonitorPlay,
    title: "Your personal clip library",
    description:
      "Every video you make is saved with its exact recipe — prompt and settings — so you can replay, download, or remix any clip with a small tweak in seconds.",
  },
  {
    icon: SlidersHorizontal,
    title: "You're the director",
    description:
      "Pick the length, resolution and aspect ratio: vertical for Reels and TikTok, widescreen for YouTube. Lock a seed to recreate a look you love, or leave it to chance.",
  },
  {
    icon: Film,
    title: "Studio-quality output",
    description:
      "Cinematic full-HD renders with HDR color science and 2× AI upscaling — footage polished enough to post straight to your feed, your client, or the big screen.",
  },
] as const;

const STEPS = [
  {
    icon: Wand2,
    title: "Describe your idea",
    description:
      "Type a sentence or drop in a photo. Choose a format — vertical, widescreen or square — adjust the length if you like, and hit generate.",
  },
  {
    icon: Activity,
    title: "Watch it render",
    description:
      "LTX-2.5 creates your video with synchronized sound while you watch the progress live. Queue up several ideas at once and let them render in the background.",
  },
  {
    icon: Download,
    title: "Download & share",
    description:
      "Preview the finished clip instantly, download the MP4 and post it anywhere. Every video stays in your library, ready to replay or remix forever.",
  },
] as const;

const USE_CASES = [
  {
    icon: MonitorPlay,
    title: "Social content",
    description:
      "Endless scroll-stopping clips for TikTok, Reels and Shorts — vertical, punchy and generated in minutes, not days.",
  },
  {
    icon: Clapperboard,
    title: "Ads & product shots",
    description:
      "Place your product in scenes no camera ever visited — marble countertops, rain-slicked streets, orbit above the Earth.",
  },
  {
    icon: Film,
    title: "Storyboards & concept films",
    description:
      "Visualize a scene before you shoot it. Pitch moods, camera moves and locations to clients without a production budget.",
  },
  {
    icon: Images,
    title: "Photos that move",
    description:
      "Turn portraits, artwork and old photos into living footage with a single prompt — a new life for your camera roll.",
  },
] as const;

const SPEC_GROUPS = [
  {
    icon: Film,
    title: "Picture quality",
    items: [
      "Full HD 1080p renders",
      "2× AI upscaling for extra sharpness",
      "HDR color science for cinematic depth",
    ],
  },
  {
    icon: Activity,
    title: "Motion & length",
    items: [
      "Up to 30 fps smooth motion",
      "Any clip length you need",
      "Auto-length tuned to your prompt",
    ],
  },
  {
    icon: AudioLines,
    title: "Sound",
    items: [
      "Synchronized audio on every clip",
      "Independent control over video & sound",
    ],
  },
  {
    icon: SlidersHorizontal,
    title: "Formats",
    items: [
      "Vertical, widescreen and square",
      "Any aspect ratio for any platform",
      "Start frames from your own images",
    ],
  },
] as const;

const TRUST_POINTS = [
  {
    icon: Zap,
    title: "Truly unlimited",
    description:
      "No credits to buy, no per-video charges, no queues to pay to skip. Generate a hundred variations of an idea if you want — the only limit is your imagination.",
  },
  {
    icon: Lock,
    title: "Radically private",
    description:
      "Your prompts, images and videos never leave your machine. Nothing is uploaded, scanned or used to train anyone else's model — what you make is nobody's business but yours.",
  },
  {
    icon: ShieldCheck,
    title: "Yours, forever",
    description:
      "Every clip is stored on your own device in full quality, with its exact recipe attached. Download it, post it, or come back a year later and remix it — it's all still there.",
  },
] as const;

const FAQS = [
  {
    question: "What can I create with LTX Studio?",
    answer:
      "Anything you can describe: cinematic b-roll, product commercials, social clips, animated photos, concept films and storyboards. Start from a sentence or from one of your own images, and you'll get a finished clip with picture and sound.",
  },
  {
    question: "Do I need any video editing experience?",
    answer:
      "None at all. If you can write a sentence, you can make a video. The prompt assistant can even polish your idea for you, and every setting has a sensible default — most people generate their first clip within minutes.",
  },
  {
    question: "How long does a video take to generate?",
    answer:
      "Typically around a minute, depending on the length and resolution you choose. You can watch the progress live in the studio, and queue up several ideas to render one after another while you do something else.",
  },
  {
    question: "What quality can I expect?",
    answer:
      "Clips render in full HD (1080p) at up to 30 fps, with 2× AI upscaling, HDR color options and synchronized audio — sharp enough to post as-is on any platform.",
  },
  {
    question: "Can I use my videos for my brand or clients?",
    answer:
      "Yes — that's what it's built for. Your videos are rendered and stored on your own hardware, so there's no platform gatekeeper: download the MP4 and use your footage wherever you like.",
  },
  {
    question: "What do I need to run it?",
    answer:
      "A computer with a modern NVIDIA GPU. That's the whole trick: the AI runs on your machine instead of the cloud, which is exactly why generations are unlimited, fast and completely private.",
  },
] as const;

const MOCK_STAGES: { label: string; done: boolean; active?: boolean }[] = [
  { label: "Idea understood", done: true },
  { label: "Scene composed", done: true },
  { label: "Directing motion", done: false, active: true },
  { label: "Adding sound", done: false },
  { label: "Final polish", done: false },
];

const MOCK_LOGS = [
  "choosing the perfect camera angle…",
  "lighting the scene — neon glow, wet streets",
  "directing the motion, frame by frame…",
  "next up: adding the soundtrack",
] as const;

export default function LandingPage() {
  return (
    <div className="relative">
      {/* ------------------------------- Hero ------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,black,transparent)]" />
          <div className="absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/15 blur-[140px]" />
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <span className="animate-in fade-in slide-in-from-bottom-2 inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground duration-500">
            <Sparkles className="size-3.5 text-primary" />
            Powered by the LTX-2.5 audio-video AI model
          </span>

          <h1 className="animate-in fade-in slide-in-from-bottom-2 mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight duration-500 sm:text-6xl">
            Turn any idea into a <span className="text-gradient">cinematic video</span>
          </h1>

          <p className="animate-in fade-in slide-in-from-bottom-2 mt-5 max-w-2xl text-pretty text-base text-muted-foreground duration-500 sm:text-lg">
            Just type what you imagine — LTX Studio creates a stunning video with sound in about a
            minute. Unlimited generations, full HD, and nothing ever leaves your machine.
          </p>

          <div className="animate-in fade-in slide-in-from-bottom-2 mt-8 flex flex-wrap items-center justify-center gap-3 duration-500">
            <Link href="/studio">
              <Button size="lg" variant="gradient" className="h-11 gap-2 px-6 text-base">
                <Wand2 /> Start creating
              </Button>
            </Link>
            <Link href="/#how-it-works">
              <Button size="lg" variant="outline" className="h-11 gap-2 px-6 text-base">
                See how it works <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>

          {/* Product preview mock */}
          <div className="animate-in fade-in slide-in-from-bottom-4 mt-14 w-full max-w-4xl duration-700">
            <div className="card-elevated overflow-hidden rounded-xl border text-left">
              {/* window chrome */}
              <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-red-400/80" />
                <span className="size-2.5 rounded-full bg-amber-400/80" />
                <span className="size-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 font-mono text-[11px] text-muted-foreground">
                  studio · rendering “neon alley at night, rain”…
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                  <span className="size-1.5 animate-pulse-soft rounded-full bg-emerald-500" />
                  LIVE
                </span>
              </div>

              <div className="grid gap-0 md:grid-cols-[1fr_240px]">
                {/* progress + stage stepper */}
                <div className="p-5">
                  <div className="flex flex-wrap gap-1.5">
                    {MOCK_STAGES.map((stage) => (
                      <span
                        key={stage.label}
                        className={
                          stage.done
                            ? "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                            : stage.active
                              ? "inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground"
                              : "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                        }
                      >
                        {stage.done ? <Check className="size-2.5" /> : null}
                        {stage.label}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                      <span>Directing your video…</span>
                      <span className="font-mono text-foreground">72%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="bg-brand-gradient h-full w-[72%] rounded-full" />
                    </div>
                  </div>

                  <div className="terminal mt-4 rounded-lg p-3">
                    {MOCK_LOGS.map((line) => (
                      <p key={line} className="log-line-info truncate text-[11px] leading-5">
                        {line}
                      </p>
                    ))}
                    <p className="text-[11px] leading-5 text-zinc-400">
                      <span className="animate-pulse-soft">▍</span>
                    </p>
                  </div>
                </div>

                {/* settings sidebar */}
                <div className="border-t bg-muted/30 p-5 md:border-l md:border-t-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Output
                  </p>
                  <dl className="mt-3 space-y-2.5 text-xs">
                    {[
                      ["Resolution", "1920 × 1080"],
                      ["Frame rate", "30 fps"],
                      ["Length", "~6 seconds"],
                      ["Format", "Widescreen 16:9"],
                      ["Sound", "Included"],
                      ["Ready in", "~45 s"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-mono text-[11px] text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* stats strip */}
      <section className="border-y border-border/50 bg-muted/30">
        <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-4 gap-y-6 px-4 py-8 sm:grid-cols-5 sm:px-6">
          {HERO_STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-0.5 text-center">
              <dt className="order-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="order-1 bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------------------- Use cases ----------------------------- */}
      <section id="use-cases" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Made for creators
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">What will you make today?</h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            Creators, marketers and filmmakers use LTX Studio to go from idea to footage — without
            cameras, crews or render farms.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((useCase) => (
            <div
              key={useCase.title}
              className="card-elevated group rounded-xl border p-5 transition-colors hover:border-primary/40"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <useCase.icon className="size-5" />
              </span>
              <h3 className="mt-3 font-semibold tracking-tight">{useCase.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {useCase.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------- Features ----------------------------- */}
      <section id="features" className="border-y border-border/50 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Features</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Everything you need to make great video
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              From the first word to the final clip — a complete creation studio, powered by the
              LTX-2.5 audio-video model.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="card-elevated group transition-colors hover:border-primary/40">
              <CardContent className="flex flex-col gap-3 p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      </section>

      {/* ---------------------------- How it works --------------------------- */}
      <section id="how-it-works" className="border-y border-border/50 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Workflow</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">From idea to video in three steps</h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              No timelines, no keyframes, no learning curve — just describe, generate and share.
            </p>
          </div>

          <div className="relative mt-12 grid gap-6 md:grid-cols-3">
            {/* connector rail */}
            <div className="pointer-events-none absolute left-0 right-0 top-10 hidden border-t-2 border-dashed border-border md:block" />
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative">
                <div className="flex flex-col items-center text-center">
                  <span className="bg-brand-gradient glow-primary relative z-10 flex size-20 items-center justify-center rounded-2xl text-white">
                    <step.icon className="size-8" />
                  </span>
                  <span className="mt-4 font-mono text-xs uppercase tracking-widest text-primary">
                    Step {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ Why --------------------------------- */}
      <section id="why" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Why LTX Studio
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Everything other platforms charge for, included
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              Cloud AI video platforms bill you per second of footage and keep your prompts on their
              servers. LTX Studio flips the model: the AI runs on your own machine, so generation is
              unlimited, private — and every clip stays yours at full quality.
            </p>

            <ul className="mt-6 space-y-3">
              {[
                "Unlimited videos — no credits, no per-second billing",
                "Prompts and footage stay on your machine, always",
                "Full-quality MP4 downloads, every single time",
                "A permanent library of every clip and its recipe",
              ].map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-3" />
                  </span>
                  <span className="text-foreground/90">{point}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/studio">
                <Button variant="gradient" className="gap-2">
                  <Wand2 className="size-4" /> Start creating
                </Button>
              </Link>
              <Link href="/#how-it-works">
                <Button variant="outline" className="gap-2">
                  See how it works <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* comparison card */}
          <div className="card-elevated overflow-hidden rounded-2xl border">
            <div className="border-b bg-muted/40 p-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Cloud AI video platforms
              </p>
              <ul className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                {[
                  "Billed per second of footage",
                  "Credits to track and top up",
                  "Prompts & videos on their servers",
                  "Resolution caps on lower tiers",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative p-6">
              <div className="pointer-events-none absolute inset-0 bg-primary/5" />
              <div className="relative">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                  LTX Studio
                </p>
                <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    "Unlimited generations, forever",
                    "No credits — your hardware does the work",
                    "Everything stays on your machine",
                    "Full HD downloads, every time",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-foreground/90">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ Specs ------------------------------- */}
      <section id="specs" className="border-y border-border/50 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Under the hood
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Quality you can actually ship</h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              Real cinematic controls — not just a prompt box. Tune every render until it's exactly
              right.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SPEC_GROUPS.map((group) => (
              <div key={group.title} className="card-elevated rounded-xl border p-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <group.icon className="size-4" />
                  </span>
                  <h3 className="font-semibold tracking-tight">{group.title}</h3>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------- Self-hosted ---------------------------- */}
      <section id="security" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Private by design
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            Your machine. Your footage. Your rules.
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            Because the AI runs on your own hardware, privacy and unlimited generations aren't
            add-ons — they're simply how it works.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {TRUST_POINTS.map((point) => (
            <div key={point.title} className="card-elevated rounded-xl border p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <point.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{point.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------- FAQ -------------------------------- */}
      <section id="faq" className="border-t border-border/50 bg-muted/30">
        <div className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">FAQ</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Frequently asked questions</h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              Everything creators usually ask before making their first video.
            </p>
          </div>

          <Accordion type="single" collapsible className="mt-10">
            {FAQS.map((faq, i) => (
              <AccordionItem key={faq.question} value={`item-${i}`}>
                <AccordionTrigger className="text-[15px]">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ----------------------------- Final CTA ----------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 pt-20 sm:px-6">
        <div className="bg-brand-gradient glow-primary relative overflow-hidden rounded-2xl px-6 py-14 text-center sm:px-12">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]" />
          <div className="relative">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Your next video is one sentence away
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-white/80 sm:text-base">
              Open the studio, type what you imagine, and watch it come to life — unlimited, private
              and in full HD.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/studio">
                <Button size="lg" className="h-11 gap-2 bg-white px-6 text-base text-zinc-900 hover:bg-white/90">
                  <Clapperboard /> Start creating
                </Button>
              </Link>
              <Link href="/#features">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 gap-2 border-white/40 bg-transparent px-6 text-base text-white hover:bg-white/10 hover:text-white"
                >
                  Explore features <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}









