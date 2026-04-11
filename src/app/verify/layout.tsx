export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Hide the main nav and reset main element margins for public verify pages */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            nav { display: none !important; }
            main { margin-left: 0 !important; padding-bottom: 0 !important; }
          `,
        }}
      />
      {children}
    </>
  );
}
