"use client";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  value, onChange, options, className, label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[] | { value: T; label: string }[];
  className?: string;
  label?: string;
}) {
  const opts = (options as (T | { value: T; label: string })[]).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex items-center gap-0.5 rounded-xl border border-line/80 bg-header/80 p-1", className)}>
      {opts.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-7 whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors",
            value === o.value ? "bg-brandtint font-semibold text-brand ring-1 ring-inset ring-brand/25" : "font-medium text-mute hover:text-sub"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
