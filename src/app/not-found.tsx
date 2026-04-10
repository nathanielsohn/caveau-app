import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <span className="text-gold text-4xl mb-4">◈</span>
      <h2 className="font-serif text-2xl text-primary mb-2">Page not found</h2>
      <p className="text-secondary text-sm mb-6">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/" className="btn-gold">
        Back to Dashboard
      </Link>
    </div>
  );
}
