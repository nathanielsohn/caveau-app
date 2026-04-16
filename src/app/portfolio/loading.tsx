export default function PortfolioLoading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="h-10 w-64 glass-card animate-pulse" />
      <div className="glass-card p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-caveau-graphite/50 rounded animate-pulse" />
              <div className="h-8 w-24 bg-caveau-graphite/50 rounded animate-pulse" />
              <div className="h-3 w-28 bg-caveau-graphite/50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      <div className="glass-card h-96 animate-pulse" />
    </div>
  );
}
