"use client";

export default function VerifyError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12 text-center">
      <span className="text-gold text-5xl mb-6">◈</span>
      <p className="text-danger text-lg font-serif mb-2">
        Verification service is temporarily unavailable
      </p>
      <p className="text-secondary text-sm mb-6 max-w-md">
        We couldn&apos;t verify the certificate right now. Please try again in a
        moment.
      </p>
      <button onClick={reset} className="btn-gold">
        Try again
      </button>
    </div>
  );
}
