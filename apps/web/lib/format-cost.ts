export function formatCost(cost: number | null | undefined): string {
  if (typeof cost !== "number" || !Number.isFinite(cost)) {
    return "Pricing unavailable";
  }
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: cost < 0.01 ? 4 : 2,
    style: "currency",
  }).format(cost);
}
