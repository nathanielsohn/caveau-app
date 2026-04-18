"use client";

import { motion, useReducedMotion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface MetricCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  trend?: {
    value: number; // percent change, e.g. 5.2 or -3.1
    label?: string; // e.g. "vs last month"
  };
  /** Small line rendered underneath the trend label, e.g. "Updated 2h ago" */
  footnote?: string;
  /** Index for stagger animation (pass from parent grid) */
  index?: number;
}

/** Animate a number from its current value to target over ~600ms */
function useAnimatedNumber(target: number) {
  const [current, setCurrent] = useState(target);
  const rafRef = useRef<number>(0);
  const previousTarget = useRef(target);

  useEffect(() => {
    const from = previousTarget.current;
    previousTarget.current = target;

    if (from === target) return;

    const duration = 600;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return current;
}

/** Extract the leading number from a formatted string like "$48,000" or "55.2°F" */
function extractNumber(formatted: string): number {
  const match = formatted.match(/[\d,.]+/);
  if (!match) return 0;
  return parseFloat(match[0].replace(/,/g, ""));
}

/** Replace the number portion of a formatted string with an animated value */
function replaceNumber(
  template: string,
  animatedNum: number
): string {
  const match = template.match(/[\d,.]+/);
  if (!match) return template;

  // Determine decimal places from original
  const decimalMatch = match[0].match(/\.(\d+)/);
  const decimals = decimalMatch?.[1]?.length ?? 0;

  // Format with commas if the original had them
  const hasCommas = match[0].includes(",");
  let formatted: string;
  if (hasCommas) {
    formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(animatedNum);
  } else {
    formatted = animatedNum.toFixed(decimals);
  }

  return template.replace(match[0], formatted);
}

export default function MetricCard({ icon: Icon, value, label, trend, footnote, index = 0 }: MetricCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const targetNum = extractNumber(value);
  const animatedNum = useAnimatedNumber(targetNum);
  const displayValue = replaceNumber(value, animatedNum);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : {
        duration: 0.35,
        delay: index * 0.08,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      className="glass-card p-4 md:p-5 flex flex-col gap-3 cursor-default"
    >
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-gold/20 border border-gold/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-gold" />
        </div>
        {trend && (
          <span
            className={`text-xs font-medium ${
              trend.value >= 0 ? "text-ok" : "text-danger"
            }`}
            aria-label={`${trend.value >= 0 ? "Up" : "Down"} ${Math.abs(trend.value).toFixed(1)} percent`}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value.toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xl md:text-2xl font-semibold text-primary tracking-tight tabular-nums break-words">
          {displayValue}
        </p>
        <p className="text-xs md:text-sm text-secondary mt-0.5">{label}</p>
      </div>
      {trend?.label && (
        <p className="text-xs text-muted">{trend.label}</p>
      )}
      {footnote && (
        <p className="text-[11px] text-muted/80 tabular-nums">{footnote}</p>
      )}
    </motion.div>
  );
}
