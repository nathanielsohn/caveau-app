"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <span className="text-gold text-4xl mb-4">◈</span>
      <h2 className="font-serif text-2xl text-primary mb-2">
        Couldn&apos;t load locker
      </h2>
      <p className="text-secondary text-sm mb-6 max-w-md">
        {error.message || "An unexpected error occurred."}
      </p>
      <button onClick={reset} className="btn-gold">
        Try again
      </button>
    </div>
  );
}
