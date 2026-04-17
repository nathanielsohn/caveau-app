"use client";

export default function OnboardingError({
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
        Onboarding couldn&apos;t continue
      </p>
      <p className="text-secondary text-sm mb-6 max-w-md">
        {error.message ||
          "We hit a snag setting up your account. Try again in a moment."}
      </p>
      <button onClick={reset} className="btn-gold">
        Try again
      </button>
    </div>
  );
}
