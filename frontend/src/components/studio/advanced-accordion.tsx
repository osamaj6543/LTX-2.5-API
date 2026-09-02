"use client";

import { DIFFVAE_OPTIONS, HDR_OPTIONS, OFFLOAD_OPTIONS, QUANTIZATION_OPTIONS } from "./constants";
import { LoraList } from "./lora-list";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Control, FieldValues, UseFormRegister } from "react-hook-form";
import type { PipelineType } from "@/lib/api/types";

export interface AdvancedState {
  compile: boolean;
  quantization: string;
  offload: string;
  diffvae: string;
  hdr: string;
  numInferenceSteps: string;
  videoCfg: string;
  videoStg: string;
  videoRescale: string;
  videoStgBlocks: string;
  a2vGuidance: string;
  videoSkipStep: string;
  audioCfg: string;
  audioStg: string;
  audioRescale: string;
  audioStgBlocks: string;
  v2aGuidance: string;
  audioSkipStep: string;
  maxBatchSize: string;
  numFrames: string;
  autoMin: string;
  autoMax: string;
  checkpointPath: string;
  distilledCheckpointPath: string;
  spatialUpsamplerPath: string;
  transformerPath: string;
  textEncoderPath: string;
  videoVaePath: string;
  audioVaePath: string;
  durationHeadPath: string;
  gemmaRoot: string;
}

/** Collapsible advanced sections: guidance, performance, LoRAs, model paths. */
export function AdvancedAccordion({
  advanced,
  setAdvanced,
  pipeline,
  register,
  control,
}: {
  advanced: AdvancedState;
  setAdvanced: (patch: Partial<AdvancedState>) => void;
  pipeline: PipelineType;
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
}) {
  return (
    <Accordion type="multiple" className="rounded-xl border bg-card px-4">
      {pipeline === "ti2vid" && (
        <AccordionItem value="guidance">
          <AccordionTrigger className="text-sm font-medium">Guidance &amp; STG</AccordionTrigger>
          <AccordionContent className="grid grid-cols-2 gap-3">
            <AdvancedNum label="Inference steps" value={advanced.numInferenceSteps} onChange={(v) => setAdvanced({ numInferenceSteps: v })} />
            <AdvancedNum label="Max batch size" value={advanced.maxBatchSize} onChange={(v) => setAdvanced({ maxBatchSize: v })} />
            <AdvancedNum label="Video CFG scale" value={advanced.videoCfg} onChange={(v) => setAdvanced({ videoCfg: v })} />
            <AdvancedNum label="Video STG scale" value={advanced.videoStg} onChange={(v) => setAdvanced({ videoStg: v })} />
            <AdvancedNum label="Video rescale" value={advanced.videoRescale} onChange={(v) => setAdvanced({ videoRescale: v })} />
            <AdvancedNum label="Video skip step" value={advanced.videoSkipStep} onChange={(v) => setAdvanced({ videoSkipStep: v })} />
            <AdvancedNum label="Video STG blocks (csv)" placeholder="10,20,30" value={advanced.videoStgBlocks} onChange={(v) => setAdvanced({ videoStgBlocks: v })} />
            <div className="col-span-2" />
            <AdvancedNum label="Audio CFG scale" value={advanced.audioCfg} onChange={(v) => setAdvanced({ audioCfg: v })} />
            <AdvancedNum label="Audio STG scale" value={advanced.audioStg} onChange={(v) => setAdvanced({ audioStg: v })} />
            <AdvancedNum label="Audio rescale" value={advanced.audioRescale} onChange={(v) => setAdvanced({ audioRescale: v })} />
            <AdvancedNum label="Audio skip step" value={advanced.audioSkipStep} onChange={(v) => setAdvanced({ audioSkipStep: v })} />
            <AdvancedNum label="Audio STG blocks (csv)" placeholder="5,10" value={advanced.audioStgBlocks} onChange={(v) => setAdvanced({ audioStgBlocks: v })} />
            <AdvancedNum label="A2V guidance" value={advanced.a2vGuidance} onChange={(v) => setAdvanced({ a2vGuidance: v })} />
            <AdvancedNum label="V2A guidance" value={advanced.v2aGuidance} onChange={(v) => setAdvanced({ v2aGuidance: v })} />
            <div className="col-span-2 mt-2">
              <LoraList
                control={control}
                register={register}
                name="distilledLoras"
                title="Distilled LoRAs"
                description="Stage-2 refinement adapters (--distilled-lora)."
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      )}
      <AccordionItem value="output">
        <AccordionTrigger className="text-sm font-medium">Output overrides</AccordionTrigger>
        <AccordionContent className="grid gap-4">
          <p className="text-xs text-muted-foreground">
            Leave empty to use the duration &amp; aspect choices in the composer.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <AdvancedNum label="Duration min (s)" value={advanced.autoMin} onChange={(v) => setAdvanced({ autoMin: v })} />
            <AdvancedNum label="Duration max (s)" value={advanced.autoMax} onChange={(v) => setAdvanced({ autoMax: v })} />
          </div>
          <AdvancedNum label="Fixed frame count (≥ 9)" value={advanced.numFrames} onChange={(v) => setAdvanced({ numFrames: v })} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="performance">
        <AccordionTrigger className="text-sm font-medium">Performance &amp; precision</AccordionTrigger>
        <AccordionContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <AdvancedSelect label="Quantization" options={QUANTIZATION_OPTIONS} value={advanced.quantization} onChange={(v) => setAdvanced({ quantization: v })} />
            <AdvancedSelect label="Offload" options={OFFLOAD_OPTIONS} value={advanced.offload} onChange={(v) => setAdvanced({ offload: v })} />
            <AdvancedSelect label="DiffVAE optimization" options={DIFFVAE_OPTIONS} value={advanced.diffvae} onChange={(v) => setAdvanced({ diffvae: v })} />
            <AdvancedSelect label="HDR mode" options={HDR_OPTIONS} value={advanced.hdr} onChange={(v) => setAdvanced({ hdr: v })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label htmlFor="compile" className="text-xs">torch.compile</Label>
              <p className="text-[11px] text-muted-foreground">Compile the pipeline graph (CLI defaults)</p>
            </div>
            <Switch
              id="compile"
              checked={advanced.compile}
              onCheckedChange={(v) => setAdvanced({ compile: v })}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="loras">
        <AccordionTrigger className="text-sm font-medium">LoRAs</AccordionTrigger>
        <AccordionContent>
          <LoraList control={control} register={register} name="loras" title="LoRA adapters" description="(--lora PATH [STRENGTH])" />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="models">
        <AccordionTrigger className="text-sm font-medium">Model paths</AccordionTrigger>
        <AccordionContent className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Usually pinned server-side by the operator — only override what you need.
          </p>
          <AdvancedPath label="Checkpoint (monolith)" value={advanced.checkpointPath} onChange={(v) => setAdvanced({ checkpointPath: v })} />
          <AdvancedPath label="Distilled checkpoint" value={advanced.distilledCheckpointPath} onChange={(v) => setAdvanced({ distilledCheckpointPath: v })} />
          <AdvancedPath label="Spatial upsampler" value={advanced.spatialUpsamplerPath} onChange={(v) => setAdvanced({ spatialUpsamplerPath: v })} />
          <AdvancedPath label="Transformer" value={advanced.transformerPath} onChange={(v) => setAdvanced({ transformerPath: v })} />
          <AdvancedPath label="Text encoder" value={advanced.textEncoderPath} onChange={(v) => setAdvanced({ textEncoderPath: v })} />
          <AdvancedPath label="Video VAE" value={advanced.videoVaePath} onChange={(v) => setAdvanced({ videoVaePath: v })} />
          <AdvancedPath label="Audio VAE" value={advanced.audioVaePath} onChange={(v) => setAdvanced({ audioVaePath: v })} />
          <AdvancedPath label="Duration head" value={advanced.durationHeadPath} onChange={(v) => setAdvanced({ durationHeadPath: v })} />
          <AdvancedPath label="Gemma root" value={advanced.gemmaRoot} onChange={(v) => setAdvanced({ gemmaRoot: v })} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function AdvancedNum({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="0.1"
        placeholder={placeholder ?? "auto"}
        className="h-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function AdvancedPath({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        placeholder="/models/…"
        className="h-8"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function AdvancedSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder={options[0]?.label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value || "default"} value={opt.value || "__default__"}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
