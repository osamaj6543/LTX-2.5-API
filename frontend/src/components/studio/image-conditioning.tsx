"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { uploadImage } from "@/lib/api/endpoints";
import { cn, formatBytes } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConditionedImage {
  /** Server-side path to pass to --image */
  path: string;
  /** Local preview object URL */
  preview: string;
  filename: string;
  sizeBytes: number;
  frameIdx: number;
  strength: number;
  crf: string;
  isHdr: boolean;
}

/**
 * Drag-and-drop conditioning stills. Files are uploaded immediately via
 * POST /v1/uploads and the returned server path is what gets submitted with
 * the generation request (frame index / strength / CRF per slot).
 */
export function ImageConditioning({
  images,
  onChange,
}: {
  images: ConditionedImage[];
  onChange: (images: ConditionedImage[]) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const uploaded: ConditionedImage[] = [];
      for (const file of files) {
        const res = await uploadImage(file);
        uploaded.push({
          path: res.path,
          preview: URL.createObjectURL(file),
          filename: res.filename,
          sizeBytes: res.size_bytes,
          frameIdx: 0,
          strength: 1,
          crf: "",
          isHdr: file.name.toLowerCase().endsWith(".exr"),
        });
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      onChange([...images, ...uploaded]);
      toast.success(uploaded.length === 1 ? "Image uploaded" : `${uploaded.length} images uploaded`, {
        description: "Use it as a keyframe condition below.",
      });
    },
    onError: (err) => toast.error("Upload failed", { description: (err as Error).message }),
  });

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => /\.(png|jpe?g|webp|exr)$/i.test(f.name));
    if (files.length === 0) {
      toast.error("Unsupported file type", { description: "Allowed: PNG, JPEG, WebP, EXR" });
      return;
    }
    uploadMutation.mutate(files);
  };

  const update = (index: number, patch: Partial<ConditionedImage>) => {
    onChange(images.map((img, i) => (i === index ? { ...img, ...patch } : img)));
  };


  return (
    <div className="grid gap-3">
      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload conditioning image"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent/50"
        )}
      >
        {uploadMutation.isPending ? (
          <>
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading…</p>
          </>
        ) : (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              {dragging ? <UploadCloud className="size-5" /> : <ImagePlus className="size-5" />}
            </span>
            <div>
              <p className="text-sm font-medium">Drop images here or click to browse</p>
              <p className="text-xs text-muted-foreground">
                PNG, JPEG, WebP (SDR) or EXR (HDR) — uploaded to the server instantly
              </p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.exr"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Slots */}
      {images.map((img, index) => (
        <div key={img.preview + index} className="flex gap-3 rounded-xl border p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.preview} alt={img.filename} className="size-20 shrink-0 rounded-lg object-cover" />
          <div className="grid flex-1 gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{img.filename}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatBytes(img.sizeBytes)}
                  {img.isHdr && <span className="ml-1 text-amber-500">HDR still</span>}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove image"
                onClick={() => onChange(images.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1">
                <Label className="text-[11px] text-muted-foreground">Frame idx</Label>
                <Input
                  type="number"
                  min="0"
                  value={img.frameIdx}
                  onChange={(e) => update(index, { frameIdx: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px] text-muted-foreground">Strength</Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={img.strength}
                  onChange={(e) =>
                    update(index, { strength: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })
                  }
                  className="h-8"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px] text-muted-foreground">
                  CRF {img.isHdr ? "(HDR n/a)" : "(opt.)"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="51"
                  placeholder="auto"
                  value={img.crf}
                  disabled={img.isHdr}
                  onChange={(e) => update(index, { crf: e.target.value })}
                  className="h-8"
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
