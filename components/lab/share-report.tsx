"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareReportButton({
  title,
  fragment,
  label = "Copy report link",
}: {
  title?: string;
  fragment?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "fallback">("idle");
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (state === "fallback") {
      input.current?.focus();
      input.current?.select();
    }
  }, [state, url]);

  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 3500);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copyLink() {
    // Keep the current section/conversation anchor, so readers share the evidence in view.
    const destination = new URL(window.location.href);
    if (fragment) destination.hash = fragment;
    const currentUrl = destination.href;
    setUrl(currentUrl);
    setState("fallback");
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(currentUrl);
      setState("copied");
    } catch {
      setState("fallback");
    }
  }

  return (
    <div className="share-report flex flex-col gap-2">
      <Button
        variant="outline"
        type="button"
        onClick={copyLink}
        aria-label={title ? `Copy link to ${title}` : "Copy report link"}
      >
        {state === "copied" ? (
          <Check aria-hidden="true" size={16} />
        ) : (
          <LinkIcon aria-hidden="true" size={16} />
        )}
        {state === "copied" ? "Link copied" : label}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied"
          ? "Link copied to your clipboard."
          : state === "fallback"
            ? "Select and copy the report link below."
            : ""}
      </span>
      {state === "fallback" && (
        <div className="flex flex-col gap-1 text-sm">
          <label id={labelId}>Select and copy this link:</label>
          <input
            ref={input}
            aria-labelledby={labelId}
            type="text"
            value={url}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 rounded-md border bg-white p-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}
