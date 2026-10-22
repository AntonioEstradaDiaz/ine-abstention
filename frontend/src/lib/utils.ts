import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const pct = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `${(v * 100).toLocaleString("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
export const pp = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `${v > 0 ? "+" : ""}${v.toLocaleString("es-MX", { maximumFractionDigits: 2 })} pp`;
export const number = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("es-MX");
export const riskLabels = { low: "Bajo", medium: "Medio", high: "Alto" };
export const riskColors = {
  low: "#38A879",
  medium: "#E9BD54",
  high: "#ED8750",
};
