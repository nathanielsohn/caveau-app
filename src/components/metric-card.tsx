"use client";

import { motion } from "framer-motion";
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
  /** Index for stagger animation (pass from parent grid) */
  index?: number;
}

/** Animate a number from 0 to target over ~600ms */
function useAnimatedNumber(target: number) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const duration = 600;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(target * eased);
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
  const decimals = decimalMatch ? decimalMatch[1].length : 0;

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

export default function MetricCard({ icon: Icon, value, label, trend, index = 0 }: MetricCardProps) {
  const targetNum = extractNumber(value);
  const animatedNum = useAnimatedNumber(targetNum);
  const displayValue = replaceNumber(value, animatedNum);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index * 0.08,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      whileHover={{ scale: 1.02 }}
      className="glass-card p-5 flex flex-col gap-3 cursor-default"
    >
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-gold" />
        </div>
        {trend && (
          <span
            className={`text-xs font-medium ${
              trend.value >= 0 ? "text-ok" : "text-danger"
            }`}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value.toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-semibold text-primary tracking-tight">
          {displayValue}
        </p>
        <p className="text-sm text-secondary mt-0.5">{label}</p>
      </div>
      {trend?.label && (
        <p className="text-xs text-muted">{trend.label}</p>
      )}
    </motion.div>
  );
}
