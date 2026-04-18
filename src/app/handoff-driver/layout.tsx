export default function HandoffDriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Hide the main nav on the public driver handoff pages; the courier
          opens this URL without a member session. */}
      <style>{`
        nav { display: none !important; }
        main { margin-left: 0 !important; padding-bottom: 0 !important; }
      `}</style>
      {children}
    </>
  );
}
