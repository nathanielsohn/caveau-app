"use client";

import { XCircle } from "lucide-react";

export default function BottleError() {
  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12">
      <div className="text-gold text-5xl mb-8">◈</div>
      <div className="w-full max-w-md text-center">
        <XCircle size={48} className="text-danger mx-auto mb-3" />
        <h1 className="font-serif text-2xl sm:text-3xl text-primary">
          Something went wrong
        </h1>
        <p className="text-sm text-secondary mt-2">
          We couldn&apos;t load this bottle&apos;s record right now. Please
          tap the tag again in a moment.
        </p>
      </div>
    </div>
  );
}
