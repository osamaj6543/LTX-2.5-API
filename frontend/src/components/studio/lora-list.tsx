"use client";

import { useFieldArray, type Control, type FieldValues, type UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Reusable editor for `--lora PATH [STRENGTH]` / `--distilled-lora` rows. */
export function LoraList({
  control,
  register,
  name,
  title,
  description,
  pathPlaceholder,
}: {
  control: Control<FieldValues>;
  register: UseFormRegister<FieldValues>;
  name: string;
  title: string;
  description?: string;
  pathPlaceholder?: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: name as never });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">{title}</Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => append({ path: "", strength: "" })}
        >
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="rounded-md border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
          No LoRAs — the base model will be used.
        </p>
      )}
      <div className="grid gap-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-2">
            <Input
              placeholder={pathPlaceholder ?? "/models/my-lora.safetensors"}
              {...register(`${name}.${index}.path`, { required: "Path is required" })}
              className="flex-1"
              spellCheck={false}
            />
            <Input
              type="number"
              step="0.05"
              min="0"
              placeholder="strength"
              {...register(`${name}.${index}.strength`)}
              className="w-24"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => remove(index)}
              aria-label="Remove LoRA"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
