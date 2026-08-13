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
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="text-xl">🎒</span>
              <span>Homeschool</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/" className="hover:text-blue-600">
                Home
              </Link>
              <Link href="/approvals" className="hover:text-blue-600">
                Approvals
              </Link>
              <Link href="/grades" className="hover:text-blue-600">
                Grades
              </Link>
              <Link href="/plans" className="hover:text-blue-600">
                Plans
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400 dark:border-neutral-800">
          Lucas Align Homeschool · Firebase MVP
        </footer>
      </body>
    </html>
  );
}
