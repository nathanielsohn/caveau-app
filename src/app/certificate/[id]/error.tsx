"use client";

export default function CertificateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <span className="text-gold text-3xl mb-3">◈</span>
      <p className="text-danger text-lg font-serif mb-2">
        Certificate unavailable
      </p>
      <p className="text-secondary text-sm mb-6 max-w-md">
        {error.message || "We couldn't load this certificate."}
      </p>
      <button onClick={reset} className="btn-gold">
        Try again
      </button>
    </div>
  );
}
