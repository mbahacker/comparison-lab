import type { ReactNode } from "react";

/** alhena.ai's demo scheduler; UTM tags attribute demo requests to the placement on this site. */
export function demoUrl(placement: string) {
  const url = new URL("https://alhena.ai/schedule-demo");
  url.search = new URLSearchParams({ utm_source: "evals.alhena.ai", utm_medium: "referral", utm_campaign: "research_lab", utm_content: placement }).toString();
  return url.toString();
}

export function DemoLink({ placement, className, children = "Book a demo" }: { placement: string; className?: string; children?: ReactNode }) {
  return <a className={className} href={demoUrl(placement)} target="_blank" rel="noopener">{children}</a>;
}
