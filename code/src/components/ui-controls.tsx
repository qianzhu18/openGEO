"use client";
import { useState } from "react";

export function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [keyboard, setKeyboard] = useState(false);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div className="max-w-full overflow-x-auto">
      <div
        role="group"
        aria-label={label}
        className="segmented-control"
        data-keyboard={keyboard || undefined}
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
          minWidth: options.length * 78 + 8,
        }}
        onPointerDown={() => setKeyboard(false)}
        onKeyDown={() => setKeyboard(true)}
      >
        <span
          aria-hidden="true"
          className="segmented-indicator"
          style={{
            width: `calc((100% - 8px) / ${options.length})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="relative z-10 min-h-10 whitespace-nowrap px-2 text-xs font-medium sm:text-sm"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton({
  language = "zh",
}: {
  language?: "zh" | "en";
}) {
  return (
    <div
      role="status"
      aria-label={
        language === "zh" ? "正在加载本地项目" : "Loading local projects"
      }
      className="dashboard-skeleton space-y-6"
    >
      <span className="sr-only">
        {language === "zh" ? "正在加载本地项目" : "Loading local projects"}
      </span>
      <div className="space-y-3">
        <div className="skeleton h-8 w-64 max-w-full" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="skeleton h-[66px]" />
        ))}
      </div>
      <div className="panel grid grid-cols-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <div className="metric space-y-3" key={n}>
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-8 w-24" />
            <div className="skeleton h-3 w-28 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {[0, 1].map((n) => (
          <div className="panel h-[370px] p-5" key={n}>
            <div className="skeleton h-5 w-32" />
            <div className="skeleton mt-5 h-10" />
            <div className="mt-8 space-y-6">
              {[0, 1, 2].map((row) => (
                <div className="skeleton h-8" key={row} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
