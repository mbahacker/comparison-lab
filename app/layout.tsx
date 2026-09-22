import type { Metadata } from "next";
import "./globals.css";
import "./marketing.css";
import Link from "next/link";

// Resolve public social URLs from the deployment runtime, including Docker APP_URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://127.0.0.1:3100"),
  openGraph: {
    type: "website",
    siteName: "Alhena Research Lab",
    title: "Ecommerce AI agents, tested on real storefronts",
    description:
      "Explore the latest ecommerce AI studies: shopping and support composites, policy-compliant resolution, quality, speed and the evidence behind each score.",
  },
  twitter: { card: "summary_large_image" },
  title: {
    default: "Alhena Research Lab · Ecommerce AI agents, tested on real storefronts",
    template: "%s · Alhena Research Lab",
  },
  description:
    "Compare ecommerce AI using the latest published research. Explore shopping and support composites, separate resolution, quality and speed scores, and conversation evidence.",
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
      </head>
      <body>
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
              <Link className="nav-link" href="/#tools">Results</Link>
              <Link className="nav-link nav-secondary" href="/studies">Studies</Link>
              <Link className="nav-link nav-secondary" href="/methodology">Methodology</Link>
              <Link className="nav-cta" href="/request">
                Analyze your tool
              </Link>
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
              <Link href="/#tools">Latest results</Link>
              <Link href="/studies">Studies</Link>
              <Link href="/methodology">Methodology</Link>
              <Link href="/#archive">Quality pilot archive</Link>
            </nav>
            <nav className="footer-links" aria-label="Evaluations">
              <p>Evaluations</p>
              <Link href="/request">Analyze your tool</Link>
              <a href="/tool-scores.json">Scores as JSON</a>
              <a href="/llms.txt">llms.txt</a>
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
