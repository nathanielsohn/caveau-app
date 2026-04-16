export default function BottleLoading() {
  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12">
      <div className="text-gold text-5xl mb-6 animate-pulse">◈</div>
      <p className="text-xs tracking-[0.2em] uppercase text-muted">
        Reading tag…
      </p>
    </div>
  );
}
