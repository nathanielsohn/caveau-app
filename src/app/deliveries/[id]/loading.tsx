export default function DeliveryLoading() {
  return (
    <div className="min-h-screen bg-caveau-black text-primary px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <div className="h-6 w-40 bg-[#1C1C20] rounded-md mb-6 animate-pulse" />
        <div className="bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 md:p-10">
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-[#1C1C20] rounded-xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
