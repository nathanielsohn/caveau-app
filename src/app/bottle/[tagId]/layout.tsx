export default function BottleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Hide the member nav — this page is public and must look clean on
          a first tap from a prospective buyer's phone. */}
      <style>{`
        nav { display: none !important; }
        main { margin-left: 0 !important; padding-bottom: 0 !important; }
      `}</style>
      {children}
    </>
  );
}
