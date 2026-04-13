export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Hide the main nav and reset main element margins for the
          full-screen onboarding wizard. */}
      <style>{`
        nav { display: none !important; }
        main { margin-left: 0 !important; padding-bottom: 0 !important; }
      `}</style>
      {children}
    </>
  );
}
