import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { FlaskConical, ArrowUpRight } from "lucide-react";

export const metadata: Metadata = {
  title: { default: "Comparison Lab · Evidence you can inspect", template: "%s · Comparison Lab" },
  description: "Explore AI shopping and support comparisons, inspect the evidence, or request a new evaluation using the same published rubric.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header"><div className="shell header-inner">
          <Link href="/" className="wordmark" aria-label="Comparison Lab home"><span className="brand-icon"><FlaskConical size={22}/></span>Comparison<span className="wordmark-light">Lab</span></Link>
          <nav aria-label="Main navigation"><Link href="/">Reports</Link><Link href="/methodology">The rubric</Link><Link className="nav-cta" href="/request">New comparison <ArrowUpRight size={16}/></Link></nav>
        </div></header>
        {children}
        <footer className="site-footer shell"><p>Comparison Lab <span>by Alhena</span></p><div><Link href="/methodology">Methodology</Link><Link href="/privacy">Privacy</Link><a href="https://github.com/mbahacker/comparison-lab" target="_blank" rel="noreferrer">Source code</a></div><small>Commissioned evaluations. Published criteria. Inspectable evidence.</small></footer>
      </body>
    </html>
  );
}
