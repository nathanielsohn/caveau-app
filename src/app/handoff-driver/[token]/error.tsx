"use client";

export default function HandoffDriverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-caveau-black text-primary px-4 py-10 md:py-16 flex items-center justify-center">
      <div className="max-w-md w-full text-center">
        <span className="text-gold text-4xl block mb-3">◈</span>
        <p className="text-danger text-lg font-serif mb-2">
          Couldn&apos;t load this handoff
        </p>
        <p className="text-secondary text-sm mb-6">
          {error.message || "Try again in a moment."}
        </p>
        <button onClick={reset} className="btn-gold">
          Try again
        </button>
      </div>
    </div>
  );
}
