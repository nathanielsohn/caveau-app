"use client";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12 text-center">
      <span className="text-gold text-5xl mb-6">◈</span>
      <p className="text-danger text-lg font-serif mb-2">
        Sign-in is unavailable
      </p>
      <p className="text-secondary text-sm mb-6 max-w-md">
        {error.message ||
          "We couldn't load the sign-in page. Try again in a moment."}
      </p>
      <button onClick={reset} className="btn-gold">
        Try again
      </button>
    </div>
  );
}
