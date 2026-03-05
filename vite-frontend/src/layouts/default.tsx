import { Navbar } from "@/components/navbar";
import { APP_VERSION } from "@/version";

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col min-h-screen bg-white dark:bg-black">
      <Navbar />
      <main className="container mx-auto max-w-7xl px-4 sm:px-6 flex-grow pt-4 sm:pt-16">
        {children}
      </main>
      <footer className="py-3 text-center">
        <span className="text-xs text-default-400">v{APP_VERSION}</span>
      </footer>
    </div>
  );
}

