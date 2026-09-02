import type { JobStatus } from "@/lib/api/types";

/** Visual aspect-ratio presets (sizes are on the model's 64px grid). */
export const ASPECT_PRESETS = [
  { id: "16:9", label: "Landscape", sub: "16:9", width: 1280, height: 720, box: "w-9 h-5" },
  { id: "9:16", label: "Portrait", sub: "9:16", width: 720, height: 1280, box: "w-5 h-9" },
  { id: "1:1", label: "Square", sub: "1:1", width: 960, height: 960, box: "w-7 h-7" },
  { id: "4:3", label: "Classic", sub: "4:3", width: 1024, height: 768, box: "w-8 h-6" },
  { id: "custom", label: "Custom", sub: "any", width: 1280, height: 720, box: "w-6 h-6" },
] as const;

/** Duration chips — "auto" lets the model decide; fixed values use auto-duration min=max. */
export const DURATION_PRESETS = [
  { id: "auto", label: "Auto", seconds: null, hint: "Model picks 4–8s" },
  { id: "3", label: "3s", seconds: 3, hint: "3 seconds" },
  { id: "5", label: "5s", seconds: 5, hint: "5 seconds" },
  { id: "8", label: "8s", seconds: 8, hint: "8 seconds" },
  { id: "10", label: "10s", seconds: 10, hint: "10 seconds" },
] as const;


export const QUANTIZATION_OPTIONS = [
  { value: "", label: "Default (CLI)" },
  { value: "fp8-cast", label: "fp8-cast" },
  { value: "fp8-scaled-mm", label: "fp8-scaled-mm" },
  { value: "nvfp4-cast", label: "nvfp4-cast" },
  { value: "nvfp4-prequant", label: "nvfp4-prequant" },
];

export const OFFLOAD_OPTIONS = [
  { value: "", label: "Default (CLI)" },
  { value: "none", label: "None" },
  { value: "cpu", label: "CPU offload" },
  { value: "disk", label: "Disk offload" },
];

export const DIFFVAE_OPTIONS = [
  { value: "", label: "Default (CLI)" },
  { value: "chunked_eager", label: "Chunked eager" },
  { value: "chunked_compile", label: "Chunked compile" },
  { value: "combined_compile", label: "Combined compile" },
  { value: "blackwell_dsl", label: "Blackwell DSL" },
];

export const HDR_OPTIONS = [
  { value: "", label: "SDR (off)" },
  { value: "SRGB_LINEAR", label: "sRGB linear" },
  { value: "ACESCG", label: "ACEScg" },
  { value: "ACESCCT", label: "ACEScct" },
];

export const PROMPT_PRESETS = [
  "A woman with long brown hair walks along a beach at sunset, golden light, waves rolling in, cinematic slow motion, 35mm film",
  "A neon-lit futuristic city street at night, rain-soaked pavement reflecting holographic signs, a lone figure walks past, cinematic",
  "Macro shot of a bee landing on a sunflower, pollen drifting in warm morning light, ultra detailed, shallow depth of field",
  "A red vintage convertible drives along a coastal cliff road at golden hour, drone shot, ocean spray, cinematic color grade",
  "Time-lapse of storm clouds gathering over a vast desert plain, lightning strikes in the distance, dramatic atmosphere",
];

export const ACTIVE_STATUSES: JobStatus[] = ["queued", "parsing", "loading_model", "running", "encoding"];
