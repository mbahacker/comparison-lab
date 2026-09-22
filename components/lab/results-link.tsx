"use client";
import Link from "next/link";
import type { ComponentProps } from "react";

type Tab = "tools" | "comparisons" | "archive";

/**
 * Links to a results-library tab. On the homepage, Next's client navigation
 * changes the hash without a hashchange event, which is what selects the tab
 * and scrolls to the results, so fire it directly there.
 */
export function ResultsLink({ tab, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { tab: Tab }) {
  return <Link {...props} href={`/#${tab}`} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || location.pathname !== "/") return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash === `#${tab}`) window.dispatchEvent(new HashChangeEvent("hashchange"));
    else location.hash = tab;
  }} />;
}
