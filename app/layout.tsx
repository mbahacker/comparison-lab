import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// Resolve public social URLs from the deployment runtime, including Docker APP_URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://127.0.0.1:3100"),
  openGraph: {
    type: "website",
    siteName: "Alhena Comparison Lab",
    title: "Put ecommerce AI to the test",
    description:
      "Compare shopping and support quality. Inspect every conversation or request your own comparison.",
  },
  twitter: { card: "summary_large_image" },
  title: {
    default: "Alhena Comparison Lab · Put ecommerce AI to the test",
    template: "%s · Comparison Lab",
  },
  description:
    "Explore AI shopping and support comparisons, inspect the evidence, or request a new evaluation using the same published rubric.",
  icons: {
    icon: "/brand/alhena-mark.svg",
    shortcut: "/brand/alhena-mark.svg",
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
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="shell header-inner">
            <Link
              href="/"
              className="wordmark"
              aria-label="Comparison Lab home"
            >
              <img
                src="/brand/alhena-logo.svg"
                alt="Alhena"
                width="112"
                height="33"
              />
              <span className="wordmark-divider" />
              <span className="lab-wordmark">Comparison Lab</span>
            </Link>
            <nav aria-label="Main navigation">
              <Link href="/">Reports</Link>
              <Link href="/methodology">The rubric</Link>
              <Link className="nav-cta" href="/request">
                New comparison <ArrowUpRight size={16} />
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer shell">
          <p className="footer-brand">
            <img
              src="/brand/alhena-logo.svg"
              alt="Alhena"
              width="93"
              height="27"
            />
            <span>Comparison Lab</span>
          </p>
          <div>
            <Link href="/methodology">Methodology</Link>
            <Link href="/privacy">Privacy</Link>
            <a
              href="https://github.com/mbahacker/comparison-lab"
              target="_blank"
              rel="noreferrer"
            >
              Source code
            </a>
          </div>
          <small>
            Commissioned evaluations. Published criteria. Inspectable evidence.
          </small>
        </footer>
      </body>
    </html>
  );
}
