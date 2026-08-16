import { ReactNode } from "react";
import { Link, useLocation } from "wouter";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard" },
    { href: "/students/new", label: "Students" },
    { href: "/courses", label: "Curriculum" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20">
      <header className="border-b border-black">
        <div className="grid grid-cols-12 items-stretch">
          <div className="col-span-12 md:col-span-3 flex items-center gap-3 px-6 py-4 border-b md:border-b-0 md:border-r border-black">
            <span className="block w-3 h-3 bg-black" />
            <Link href="/" className="label-caps hover:underline cursor-pointer">Homeschool</Link>
          </div>
          
          <div className="col-span-12 md:col-span-6 flex items-stretch border-b md:border-b-0 md:border-r border-black">
            <nav className="w-full flex items-stretch divide-x divide-black">
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex-1 flex items-center justify-center px-4 py-4 label-caps transition-colors ${
                      isActive 
                        ? "bg-black text-white" 
                        : "text-black hover:bg-black hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          
          <div className="col-span-12 md:col-span-3 flex items-center justify-between md:justify-end px-6 py-4">
             <span className="label-caps">Platform · Phase 1</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="bg-black text-white">
        <div className="grid grid-cols-12 items-stretch border-t border-black">
          <div className="col-span-12 md:col-span-9 px-6 py-6 border-b md:border-b-0 md:border-r border-gray-500/30">
            <span className="label-caps text-[#9C9C9C]">Curriculum & Lessons</span>
          </div>
          <div className="col-span-12 md:col-span-3 px-6 py-6 flex items-center justify-between">
            <span className="label-caps text-[#9C9C9C]">Structured</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
