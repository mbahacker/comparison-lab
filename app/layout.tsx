import type { Metadata } from "next";
import "./globals.css";
import "./marketing.css";
import Link from "next/link";
import { ResultsLink } from "@/components/lab/results-link";
import { DemoLink } from "@/components/lab/demo-link";
import { jsonLd, siteStructuredData } from "@/lib/server/public-data";

// Resolve public social URLs from the deployment runtime, including Docker APP_URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://127.0.0.1:3100"),
  openGraph: {
    type: "website",
    siteName: "Alhena Research Lab",
    title: "Ecommerce AI agents, evaluated side by side",
    description:
      "Every agent gets the same shopper conversations on live stores. See who gets customers the right answer, and the evidence behind each score.",
  },
  twitter: { card: "summary_large_image" },
  title: {
    default: "Alhena Research Lab · Ecommerce AI agents, tested on real storefronts",
    template: "%s · Alhena Research Lab",
  },
  description:
    "Ecommerce AI shopping and support agents tested on live storefronts with the same customer conversations. Published resolution, answer quality and speed scores, with the evidence behind each one.",
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
      <head>
        <link rel="preload" href="/fonts/fraunces-var.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/dm-sans-var.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="alternate" type="application/json" href="/study-scores.json" title="Published study summaries (JSON)" />
        <link rel="alternate" type="application/json" href="/tool-scores.json" title="Current tool scores (JSON)" />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(siteStructuredData()) }} />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="shell header-inner">
            <Link
              href="/"
              className="wordmark"
              aria-label="Alhena Research Lab home"
            >
              <img
                src="/brand/alhena-logo.svg"
                alt="Alhena"
                width="112"
                height="33"
              />
              <span className="wordmark-divider" />
              <span className="lab-wordmark">Research Lab</span>
            </Link>
            <nav aria-label="Main navigation">
              <ResultsLink className="nav-link" tab="tools">Results</ResultsLink>
              <Link className="nav-link nav-secondary" href="/studies">Studies</Link>
              <Link className="nav-link nav-secondary" href="/methodology">Methodology</Link>
              <Link className="nav-secondary-cta" href="/request">
                Analyze your tool
              </Link>
              <DemoLink placement="header" className="nav-cta" />
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="shell footer-grid">
            <div className="footer-brand">
              <p className="footer-logo">
                <img
                  src="/brand/alhena-logo.svg"
                  alt="Alhena"
                  width="93"
                  height="27"
                />
                <span>Research Lab</span>
              </p>
              <p>Commissioned evaluations. Published criteria. Inspectable evidence.</p>
            </div>
            <nav className="footer-links" aria-label="Research">
              <p>Research</p>
              <ResultsLink tab="tools">Latest results</ResultsLink>
              <Link href="/studies">Studies</Link>
              <Link href="/methodology">Methodology</Link>
              <ResultsLink tab="archive">Quality pilot archive</ResultsLink>
            </nav>
            <nav className="footer-links" aria-label="Evaluations">
              <p>Evaluations</p>
              <Link href="/request">Analyze your tool</Link>
              <DemoLink placement="footer" />
              <a href="/tool-scores.json">Scores as JSON</a>
              <a href="/llms.txt">llms.txt</a>
              <a href="/llms-full.txt">llms-full.txt</a>
            </nav>
            <nav className="footer-links" aria-label="About">
              <p>About</p>
              <Link href="/privacy">Privacy</Link>
              <a
                href="https://github.com/mbahacker/comparison-lab"
                target="_blank"
                rel="noreferrer"
              >
                Source code
              </a>
              <a href="https://alhena.ai/" target="_blank" rel="noreferrer">
                alhena.ai
              </a>
            </nav>
          </div>
          <div className="shell footer-note">
            <small>
              Alhena Research Lab is operated by Alhena. Scores describe the
              storefronts and dates tested in each study.
            </small>
          </div>
        </footer>
      </body>
    </html>
  );
}
