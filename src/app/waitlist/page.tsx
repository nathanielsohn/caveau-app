import type { Metadata } from "next";
import WaitlistForm from "./waitlist-form";

export const metadata: Metadata = {
  title: "Founding Member Waitlist · Caveau",
  description:
    "Reserve your place on the Caveau founding member waitlist. Private wine vault in Naples, Florida — opening Q3 2027.",
};

export const dynamic = "force-dynamic";

export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-caveau-black px-4 py-12 md:py-20">
      <div className="max-w-xl mx-auto">
        {/* Brand */}
        <div className="text-center mb-10">
          <span className="text-gold text-5xl">◈</span>
          <h1 className="font-serif text-3xl md:text-4xl text-primary mt-3 tracking-wide">
            Caveau
          </h1>
          <p className="text-xs text-muted uppercase tracking-[0.25em] mt-2">
            Founding Member Waitlist
          </p>
        </div>

        {/* Value prop */}
        <div className="text-center mb-10 space-y-4">
          <h2 className="font-serif text-xl md:text-2xl text-primary">
            A private wine vault for Southwest Florida.
          </h2>
          <p className="text-sm text-secondary leading-relaxed">
            Climate-controlled storage, Sentinel 24/7 monitoring, and chain-of-custody
            provenance for every bottle. Launching in Naples, Q3 2027.
          </p>
          <p className="text-sm text-gold-text leading-relaxed">
            Founding members receive lifetime priority locker access and a
            discounted first-year membership.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 md:p-8">
          <WaitlistForm />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted mt-8">
          Your information is held in confidence and is used only to contact
          you about Caveau membership.
        </p>
      </div>
    </div>
  );
}
