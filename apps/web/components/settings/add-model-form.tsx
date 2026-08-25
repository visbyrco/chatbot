"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AddModelFormProps = {
  providerId: string;
  onModelAdded: () => void;
};

const PRICING_FIELDS = [
  ["input", "Input"],
  ["output", "Output"],
  ["cachedInput", "Cached input"],
  ["cachedOutput", "Cached output"],
] as const;

export function AddModelForm({ providerId, onModelAdded }: AddModelFormProps) {
  const [modelId, setModelId] = useState("");
  const [name, setName] = useState("");
  const [tools, setTools] = useState(true);
  const [vision, setVision] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [pricing, setPricing] = useState({
    cachedInput: "",
    cachedOutput: "",
    input: "",
    output: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/settings/providers/${providerId}/models`,
          {
            body: JSON.stringify({
              capabilities: { reasoning, tools, vision },
              modelId,
              name,
              pricing: Object.fromEntries(
                Object.entries(pricing).map(([key, value]) => [
                  key,
                  value === "" ? null : Number(value),
                ])
              ),
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Failed to add model");
        }

        setModelId("");
        setName("");
        setPricing({
          cachedInput: "",
          cachedOutput: "",
          input: "",
          output: "",
        });
        onModelAdded();
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    },
    [modelId, name, onModelAdded, pricing, providerId, reasoning, tools, vision]
  );

  const handleModelIdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setModelId(e.target.value);
    },
    []
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value);
    },
    []
  );

  const handleToolsChange = useCallback((checked: boolean) => {
    setTools(checked);
  }, []);

  const handleVisionChange = useCallback((checked: boolean) => {
    setVision(checked);
  }, []);

  const handleReasoningChange = useCallback((checked: boolean) => {
    setReasoning(checked);
  }, []);

  const handlePricingChange = useCallback(
    (key: keyof typeof pricing, value: string) => {
      setPricing((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const handlePricingInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const key = event.currentTarget.dataset.pricingKey as
        | keyof typeof pricing
        | undefined;
      if (key) {
        handlePricingChange(key, event.currentTarget.value);
      }
    },
    [handlePricingChange]
  );

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-transparent p-3"
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="modelId">
            Model ID
          </Label>
          <Input
            className="h-8 text-xs"
            id="modelId"
            onChange={handleModelIdChange}
            placeholder="gpt-4o"
            required
            value={modelId}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="name">
            Display Name
          </Label>
          <Input
            className="h-8 text-xs"
            id="name"
            onChange={handleNameChange}
            placeholder="GPT-4o"
            required
            value={name}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Pricing (USD per million tokens)</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRICING_FIELDS.map(([key, label]) => (
            <Input
              aria-label={`${label} pricing`}
              data-pricing-key={key}
              key={key}
              min="0"
              onChange={handlePricingInputChange}
              placeholder={label}
              step="any"
              type="number"
              value={pricing[key as keyof typeof pricing]}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Capabilities</Label>
        <div className="flex gap-4">
          <label
            className="flex items-center gap-1.5 text-xs"
            htmlFor="cap-tools"
          >
            <Checkbox
              checked={tools}
              id="cap-tools"
              onCheckedChange={handleToolsChange}
            />
            Tools
          </label>
          <label
            className="flex items-center gap-1.5 text-xs"
            htmlFor="cap-vision"
          >
            <Checkbox
              checked={vision}
              id="cap-vision"
              onCheckedChange={handleVisionChange}
            />
            Vision
          </label>
          <label
            className="flex items-center gap-1.5 text-xs"
            htmlFor="cap-reasoning"
          >
            <Checkbox
              checked={reasoning}
              id="cap-reasoning"
              onCheckedChange={handleReasoningChange}
            />
            Reasoning
          </label>
        </div>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <Button className="self-end" disabled={isLoading} size="sm" type="submit">
        {isLoading ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : null}
        Add Model
      </Button>
    </form>
  );
}
