"use client";

export default function PortfolioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 md:p-10">
      <div className="glass-card p-10 text-center">
        <span className="text-gold text-3xl block mb-3">◈</span>
        <p className="text-danger text-lg font-serif mb-2">
          Portfolio failed to load
        </p>
        <p className="text-secondary text-sm mb-6 max-w-md mx-auto">
          {error.message ||
            "We couldn't load your investment portfolio. Try again in a moment."}
        </p>
        <button onClick={reset} className="btn-gold">
          Try again
        </button>
      </div>
    </div>
  );
}
