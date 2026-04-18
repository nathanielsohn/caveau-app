"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Next's App Router already redacts server error messages in prod, but we
  // also gate on NODE_ENV here so a client-thrown Error (which isn't
  // redacted) can't surface stack-trace-like content to a real user.
  const showDetail = process.env.NODE_ENV !== "production";
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <span className="text-gold text-4xl mb-4">◈</span>
      <h2 className="font-serif text-2xl text-primary mb-2">
        Something went wrong
      </h2>
      <p className="text-secondary text-sm mb-6 max-w-md">
        {showDetail && error.message
          ? error.message
          : "An unexpected error occurred. Please try again."}
      </p>
      {error.digest ? (
        <p className="text-muted text-xs mb-6">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
      <button onClick={reset} className="btn-gold">
        Try again
      </button>
    </div>
  );
}
