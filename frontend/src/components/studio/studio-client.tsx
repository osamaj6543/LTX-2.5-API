"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
  ChevronRight,
  Clapperboard,
  Dices,
  Film,
  FolderKanban,
  ImagePlus,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { submitDistilled, submitTi2vid } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import type { DistilledGenerationRequest, PipelineType, TI2VidGenerationRequest } from "@/lib/api/types";
import { useProjectStore } from "@/lib/store/projects";
import { ProjectChip } from "@/components/projects/project-chip";
import { ASPECT_PRESETS, DURATION_PRESETS, PROMPT_PRESETS } from "./constants";
import { ImageConditioning, type ConditionedImage } from "./image-conditioning";
import { AdvancedAccordion, type AdvancedState } from "./advanced-accordion";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface StudioForm {
  prompt: string;
  negativePrompt: string;
  aspect: string;
  width: number;
  height: number;
  duration: string;
  frameRate: string;
  seed: string;
  enhancePrompt: boolean;
  loras: { path: string; strength: string }[];
  distilledLoras: { path: string; strength: string }[];
}

const DEFAULTS: StudioForm = {
  prompt: "",
  negativePrompt: "",
  aspect: "16:9",
  width: 1280,
  height: 720,
  duration: "auto",
  frameRate: "",
  seed: "",
  enhancePrompt: false,
  loras: [],
  distilledLoras: [],
};

const INITIAL_ADVANCED: AdvancedState = {
  compile: false,
  quantization: "",
  offload: "",
  diffvae: "",
  hdr: "",
  numInferenceSteps: "",
  videoCfg: "",
  videoStg: "",
  videoRescale: "",
  videoStgBlocks: "",
  a2vGuidance: "",
  videoSkipStep: "",
  audioCfg: "",
  audioStg: "",
  audioRescale: "",
  audioStgBlocks: "",
  v2aGuidance: "",
  audioSkipStep: "",
  maxBatchSize: "",
  numFrames: "",
  autoMin: "",
  autoMax: "",
  checkpointPath: "",
  distilledCheckpointPath: "",
  spatialUpsamplerPath: "",
  transformerPath: "",
  textEncoderPath: "",
  videoVaePath: "",
  audioVaePath: "",
  durationHeadPath: "",
  gemmaRoot: "",
};

function num(v: string | number | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function intList(v: string): number[] | undefined {
  if (!v.trim()) return undefined;
  const list = v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0);
  return list.length ? list : undefined;
}

function loraList(rows: { path: string; strength: string }[]) {
  const list = rows
    .filter((r) => r.path.trim() !== "")
    .map((r) => {
      const entry: { path: string; strength?: number } = { path: r.path.trim() };
      const s = num(r.strength);
      if (s !== undefined) entry.strength = s;
      return entry;
    });
  return list.length ? list : undefined;
}

/** Duration → auto-duration payload, with advanced overrides taking priority. */
function buildDuration(duration: string, advanced: AdvancedState): Partial<DistilledGenerationRequest> {
  const fixedFrames = num(advanced.numFrames);
  if (fixedFrames !== undefined) return { "num-frames": fixedFrames };
  const minOverride = num(advanced.autoMin);
  const maxOverride = num(advanced.autoMax);
  if (minOverride !== undefined || maxOverride !== undefined) {
    return { "auto-duration": { min_seconds: minOverride ?? 4, max_seconds: maxOverride ?? minOverride ?? 8 } };
  }
  if (duration === "auto") return { "auto-duration": { min_seconds: 4, max_seconds: 8 } };
  const seconds = Number(duration);
  return { "auto-duration": { min_seconds: seconds, max_seconds: seconds } };
}

export function StudioClient() {
  const router = useRouter();
  const [pipeline, setPipeline] = React.useState<PipelineType>("distilled");
  const [images, setImages] = React.useState<ConditionedImage[]>([]);
  const [advanced, setAdvanced] = React.useState<AdvancedState>(INITIAL_ADVANCED);

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<StudioForm>({ defaultValues: DEFAULTS });
  useFieldArray({ control, name: "loras" });
  useFieldArray({ control, name: "distilledLoras" });

  const aspect = watch("aspect");
  const duration = watch("duration");
  const activeAspect = ASPECT_PRESETS.find((a) => a.id === aspect) ?? ASPECT_PRESETS[0];
  const activeDuration = DURATION_PRESETS.find((d) => d.id === duration) ?? DURATION_PRESETS[0];

  const submitMutation = useMutation({
    mutationFn: async (values: StudioForm) => {
      const imageList = images.length
        ? images.map((img) => {
            const entry: Record<string, unknown> = {
              path: img.path,
              frame_idx: Math.max(0, img.frameIdx),
              strength: Math.min(1, Math.max(0, img.strength)),
            };
            const crf = num(img.crf);
            if (!img.isHdr && crf !== undefined) entry.crf = crf;
            return entry;
          })
        : undefined;

      const common: DistilledGenerationRequest = {
        prompt: values.prompt,
        project_id: useProjectStore.getState().activeProjectId ?? undefined,
        "enhance-prompt": values.enhancePrompt || undefined,
        compile: advanced.compile ? [] : undefined,
        quantization: (advanced.quantization || undefined) as DistilledGenerationRequest["quantization"],
        offload: (advanced.offload || undefined) as DistilledGenerationRequest["offload"],
        "diffvae-optimization": (advanced.diffvae || undefined) as DistilledGenerationRequest["diffvae-optimization"],
        hdr: (advanced.hdr || undefined) as DistilledGenerationRequest["hdr"],
        seed: num(values.seed),
        width: values.aspect === "custom" ? num(values.width) : activeAspect.width,
        height: values.aspect === "custom" ? num(values.height) : activeAspect.height,
        "frame-rate": num(values.frameRate),
        image: imageList as never,
        lora: loraList(values.loras) as never,
        ...buildDuration(values.duration, advanced),
        ...(advanced.checkpointPath.trim() && { "checkpoint-path": advanced.checkpointPath.trim() }),
        ...(advanced.distilledCheckpointPath.trim() && { "distilled-checkpoint-path": advanced.distilledCheckpointPath.trim() }),
        ...(advanced.spatialUpsamplerPath.trim() && { "spatial-upsampler-path": advanced.spatialUpsamplerPath.trim() }),
        ...(advanced.transformerPath.trim() && { "transformer-path": advanced.transformerPath.trim() }),
        ...(advanced.textEncoderPath.trim() && { "text-encoder-path": advanced.textEncoderPath.trim() }),
        ...(advanced.videoVaePath.trim() && { "video-vae-path": advanced.videoVaePath.trim() }),
        ...(advanced.audioVaePath.trim() && { "audio-vae-path": advanced.audioVaePath.trim() }),
        ...(advanced.durationHeadPath.trim() && { "duration-head-path": advanced.durationHeadPath.trim() }),
        ...(advanced.gemmaRoot.trim() && { "gemma-root": advanced.gemmaRoot.trim() }),
      };

      if (pipeline === "distilled") return submitDistilled(common);

      const ti2vid: TI2VidGenerationRequest = {
        ...common,
        "negative-prompt": values.negativePrompt.trim() || undefined,
        "num-inference-steps": num(advanced.numInferenceSteps),
        "video-cfg-guidance-scale": num(advanced.videoCfg),
        "video-stg-guidance-scale": num(advanced.videoStg),
        "video-rescale-scale": num(advanced.videoRescale),
        "video-stg-blocks": intList(advanced.videoStgBlocks),
        "a2v-guidance-scale": num(advanced.a2vGuidance),
        "video-skip-step": num(advanced.videoSkipStep),
        "audio-cfg-guidance-scale": num(advanced.audioCfg),
        "audio-stg-guidance-scale": num(advanced.audioStg),
        "audio-rescale-scale": num(advanced.audioRescale),
        "audio-stg-blocks": intList(advanced.audioStgBlocks),
        "v2a-guidance-scale": num(advanced.v2aGuidance),
        "audio-skip-step": num(advanced.audioSkipStep),
        "max-batch-size": num(advanced.maxBatchSize),
        "distilled-lora": loraList(values.distilledLoras) as never,
      };
      return submitTi2vid(ti2vid);
    },
    onSuccess: (data) => {
      toast.success("Generation queued", {
        description: `We'll render it now — track progress live.`,
        action: { label: "View job", onClick: () => router.push(`/jobs/${data.job_id}`) },
      });
      router.push(`/jobs/${data.job_id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(`Submission failed (${err.status})`, {
          description: err.detail.length > 180 ? `${err.detail.slice(0, 180)}…` : err.detail,
        });
      } else {
        toast.error("Submission failed", { description: (err as Error).message });
      }
    },
  });

  const isPro = pipeline === "ti2vid";
  const { activeProjectId, setActiveProject } = useProjectStore();

  return (
    <form onSubmit={handleSubmit((v) => submitMutation.mutate(v))} className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px]">
      {/* Composer column */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* Active project scope */}
        {activeProjectId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderKanban className="size-3.5 text-primary" />
              New generations are filed under <ProjectChip projectId={activeProjectId} />
            </p>
            <button
              type="button"
              onClick={() => setActiveProject(null)}
              className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              File everywhere instead
            </button>
          </div>
        )}

        {/* Mode cards */}
        <div className="grid grid-cols-2 gap-3">
          <ModeCard
            active={!isPro}
            onClick={() => setPipeline("distilled")}
            icon={<Zap className="size-4" />}
            title="Fast"
            subtitle="Distilled · seconds to a clip"
          />
          <ModeCard
            active={isPro}
            onClick={() => setPipeline("ti2vid")}
            icon={<SlidersHorizontal className="size-4" />}
            title="Pro"
            subtitle="Guided · full creative control"
          />
        </div>

        {/* Prompt composer */}
        <Card className="gap-4 py-5">
          <CardContent className="grid gap-4 px-5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Describe your shot</Label>
              <div className="flex items-center gap-2">
                <Switch id="enhance-prompt" {...register("enhancePrompt")} />
                <Label htmlFor="enhance-prompt" className="cursor-pointer text-xs text-muted-foreground">
                  <Sparkles className="mr-1 inline size-3 text-primary" />
                  Enhance
                </Label>
              </div>
            </div>
            <textarea
              rows={4}
              placeholder="A woman with long brown hair walks along a beach at sunset, golden light, cinematic slow motion…"
              className="border-input bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-lg border px-3.5 py-3 text-sm leading-relaxed shadow-xs outline-none focus-visible:ring-[3px]"
              {...register("prompt", { required: true })}
            />
            {errors.prompt && <p className="-mt-2 text-xs text-destructive">Tell us what to render — the prompt is required.</p>}
            {isPro && (
              <Input placeholder="Negative prompt — e.g. blurry, low quality, watermark…" {...register("negativePrompt")} />
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] text-muted-foreground">Try:</span>
              {PROMPT_PRESETS.slice(0, 3).map((p, i) => (
                <button
                  key={i}
                  type="button"
                  title={p}
                  onClick={() => setValue("prompt", p)}
                  className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  Idea {i + 1}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Format row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="gap-3 py-5">
            <CardContent className="grid gap-3 px-5">
              <Label className="text-sm font-semibold">Aspect ratio</Label>
              <div className="flex flex-wrap gap-2">
                {ASPECT_PRESETS.map((preset) => {
                  const active = aspect === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.sub}
                      onClick={() => {
                        setValue("aspect", preset.id);
                        if (preset.id !== "custom") {
                          setValue("width", preset.width);
                          setValue("height", preset.height);
                        }
                      }}
                      className={cn(
                        "flex w-16 flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-all",
                        active ? "border-primary bg-primary/10 shadow-sm" : "text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      <span
                        className={cn("rounded-[3px] border-2", preset.box, active ? "border-primary bg-primary/20" : "border-current opacity-60")}
                      />
                      <span className={cn("text-[10px] font-medium", active && "text-primary")}>{preset.label}</span>
                    </button>
                  );
                })}
              </div>
              {aspect === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" min="64" step="64" placeholder="Width" {...register("width", { required: true, min: 64 })} />
                  <Input type="number" min="64" step="64" placeholder="Height" {...register("height", { required: true, min: 64 })} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 py-5">
            <CardContent className="grid gap-3 px-5">
              <Label className="text-sm font-semibold">Duration</Label>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((preset) => {
                  const active = duration === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.hint}
                      onClick={() => setValue("duration", preset.id)}
                      className={cn(
                        "h-9 min-w-12 rounded-lg border px-3 text-xs font-semibold transition-all",
                        active ? "border-primary bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">Frame rate</Label>
                  <Input type="number" min="1" step="0.001" placeholder="default" className="h-8" {...register("frameRate")} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">Seed</Label>
                  <div className="flex gap-1">
                    <Input type="number" min="0" placeholder="random" className="h-8" {...register("seed", { min: 0 })} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Randomize seed"
                      onClick={() => setValue("seed", String(Math.floor(Math.random() * 2 ** 31)))}
                    >
                      <Dices className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reference stills */}
        <Card className="gap-3 py-5">
          <CardContent className="grid gap-3 px-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <ImagePlus className="size-4 text-primary" />
                  Reference stills
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Optional keyframe images — frame 0 becomes the first frame.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Optional</span>
            </div>
            <ImageConditioning images={images} onChange={setImages} />
          </CardContent>
        </Card>

        {/* Submit bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-sm">
          <div className="text-xs text-muted-foreground">
            {isPro ? "Pro render" : "Fast render"} · {activeAspect.label}
            {aspect !== "custom" && ` (${activeAspect.width}×${activeAspect.height})`} ·{" "}
            {activeDuration.seconds ? `${activeDuration.seconds}s` : "auto duration"}
          </div>
          <Button type="submit" size="lg" variant="gradient" disabled={submitMutation.isPending} className="h-11 gap-2 px-6">
            {submitMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Submitting…
              </>
            ) : (
              <>
                Generate <ChevronRight />
              </>
            )}
          </Button>
        </div>
      </div>
      {/* Advanced column */}
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Advanced controls
          </p>
          <AdvancedAccordion
            advanced={advanced}
            setAdvanced={(patch) => setAdvanced((prev) => ({ ...prev, ...patch }))}
            pipeline={pipeline}
            register={register as never}
            control={control as never}
          />
        </div>

        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Clapperboard className="size-4 text-primary" />
            What happens next
          </p>
          <ol className="mt-2.5 grid gap-1.5 text-xs text-muted-foreground">
            <li>1. Your job enters the render queue</li>
            <li>2. Watch live pipeline logs &amp; stages</li>
            <li>3. Play and download the finished MP4</li>
          </ol>
        </div>
      </div>
    </form>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
        active ? "border-primary bg-primary/5 shadow-lg shadow-primary/5" : "border-border bg-card hover:border-primary/40"
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-brand-gradient text-white" : "bg-muted text-muted-foreground group-hover:text-foreground"
        )}
      >
        {icon}
      </span>
      <span>
        <span className={cn("block text-sm font-semibold", active && "text-primary")}>{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {active && (
        <span className="absolute top-3 right-3 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
          ✓
        </span>
      )}
    </button>
  );
}


