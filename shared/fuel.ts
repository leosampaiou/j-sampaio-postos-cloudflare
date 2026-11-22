export const FUEL_TYPES = ["gasolina_comum", "diesel_s10"] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

export const FUEL_TYPE_OPTIONS: ReadonlyArray<{
  value: FuelType;
  label: string;
  tone: "gasoline" | "diesel";
}> = [
  { value: "gasolina_comum", label: "GASOLINA COMUM", tone: "gasoline" },
  { value: "diesel_s10", label: "DIESEL S10", tone: "diesel" },
];

export function fuelTypeOption(value: string) {
  return FUEL_TYPE_OPTIONS.find(option => option.value === value);
}

export function fuelTypeLabel(value: string): string {
  return (
    fuelTypeOption(value)?.label ?? value.replaceAll("_", " ").toUpperCase()
  );
}
