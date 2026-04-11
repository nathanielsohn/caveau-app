export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Counteract the md:ml-56 from root layout since auth pages have no sidebar
  return <div className="md:-ml-56">{children}</div>;
}
