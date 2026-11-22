import { Fuel } from "lucide-react";
import { FUEL_TYPE_OPTIONS, fuelTypeOption, type FuelType } from "@shared/fuel";

type FuelTypeBadgeProps = {
  fuelType: string;
  className?: string;
};

export function FuelTypeBadge({
  fuelType,
  className = "",
}: FuelTypeBadgeProps) {
  const option = fuelTypeOption(fuelType);
  const tone = option?.tone ?? "unknown";
  const label = option?.label ?? fuelType.replaceAll("_", " ").toUpperCase();

  return (
    <span
      className={`fuel-type-badge fuel-type-${tone} ${className}`.trim()}
      aria-label={`Combustível: ${label}`}
    >
      <Fuel size={13} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

type FuelTypeRadioGroupProps = {
  name: string;
  defaultValue?: FuelType;
  ariaLabel: string;
};

export function FuelTypeRadioGroup({
  name,
  defaultValue = "gasolina_comum",
  ariaLabel,
}: FuelTypeRadioGroupProps) {
  return (
    <div
      className="fuel-type-radio-group"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {FUEL_TYPE_OPTIONS.map(option => (
        <label className="fuel-type-choice" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === defaultValue}
          />
          <FuelTypeBadge fuelType={option.value} />
        </label>
      ))}
    </div>
  );
}

type FuelTypeFilterProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
};

export function FuelTypeFilter({
  id,
  label,
  value,
  onChange,
  includeAll = true,
}: FuelTypeFilterProps) {
  return (
    <div className="fuel-type-filter">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select-control"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {includeAll && <option value="">Todos os combustíveis</option>}
        {FUEL_TYPE_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {value && <FuelTypeBadge fuelType={value} />}
    </div>
  );
}
