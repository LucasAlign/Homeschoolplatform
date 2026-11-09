import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Homeschool Platform",
  description: "Plan curriculum, build lessons, and teach your students.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="border-b border-stone-200 bg-white/80 backdrop-blur dark:border-stone-800 dark:bg-stone-900/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="text-xl">🎒</span>
              <span>Homeschool</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm text-stone-600 dark:text-stone-300">
              <Link href="/" className="transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                Home
              </Link>
              <Link href="/curriculum" className="transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                Curriculum
              </Link>
              <Link href="/approvals" className="transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                Approvals
              </Link>
              <Link href="/grades" className="transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                Grades
              </Link>
              <Link href="/plans" className="transition-colors hover:text-amber-700 dark:hover:text-amber-400">
                Plans
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-400 dark:border-stone-800">
          Lucas Align Homeschool · Firebase MVP
        </footer>
      </body>
    </html>
  );
}
