"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Mail,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { api, post, Vendor } from "@/lib/client";
import {
  CatalogProvider,
  FilledFields,
  ReusePreview,
  certainProvider,
  fillKnownProvider,
  matchesProvider,
  providerLookupQuery,
  removeAutofill,
} from "@/lib/reuse-client";
type User = { id: string; name: string; email: string; workEmailEligible?: boolean };
const blank = (): Vendor => ({
  name: "",
  website: "",
  customers: Array.from({ length: 3 }, () => ({ name: "", website: "" })),
});
export function RequestFlow() {
  const [step, setStep] = useState(0),
    [user, setUser] = useState<User | null>(null),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [vendors, setVendors] = useState<Vendor[]>([blank(), blank()]),
    [notes, setNotes] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [requestId, setRequestId] = useState(""),
    [preview, setPreview] = useState<ReusePreview | null>(null),
    [prior, setPrior] = useState<
      { id: string; status: string; providers: Vendor[] }[]
    >([]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const a = params.get("providerA")?.trim().slice(0, 100) || "";
    const b = params.get("providerB")?.trim().slice(0, 100) || "";
    if (a || b)
      setVendors([
        { ...blank(), name: a },
        { ...blank(), name: b },
      ]);
  }, []);
  useEffect(() => {
    api<{ user: User | null; requests: typeof prior }>("/auth/session")
      .then((d) => {
        if (d.user) {
          setUser(d.user);
          setEmail(d.user.email);
          setName(d.user.name);
          if (d.user.workEmailEligible !== false && d.user.name.trim()) setStep(2);
          else setNotice(d.user.workEmailEligible === false
            ? "Detailed reports and new comparisons require a verified work email. Verify a work email below."
            : "Your email is verified for reading reports. Add your name and verify your work email to request a comparison.");
        }
        setPrior(d.requests || []);
      })
      .catch(() => {});
  }, []);
  const lastStep = useRef(step);
  useEffect(() => {
    if (lastStep.current !== step) {
      lastStep.current = step;
      document
        .getElementById("flow-heading")
        ?.scrollIntoView({ block: "start" });
    }
  }, [step]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const start = (e?: FormEvent) => {
    e?.preventDefault();
    run(async () => {
      const d = await post<{ message: string; delivery: string }>(
        "/auth/start",
        { name, email, purpose: "request" },
      );
      setStep(1);
      setCode("");
      setNotice(d.message);
    });
  };
  const verify = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const d = await post<{ user: User }>("/auth/verify", { email, code });
      setUser(d.user);
      if (d.user.workEmailEligible === false || !d.user.name.trim()) {
        setStep(0);
        setNotice("A name and verified work email are required to request a comparison.");
        return;
      }
      setStep(2);
    });
  };
  const updateVendor = useCallback((index: number, value: Vendor) => {
    setVendors(old => old.map((vendor, i) => i === index ? value : vendor));
    setPreview(null);
    setConsent(false);
  }, []);
  const review = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      const result = await post<ReusePreview>("/reuse/preview", { providers: vendors });
      setPreview(result);
      setConsent(false);
      setStep(3);
    });
  };
  const submit = () =>
    run(async () => {
      if (!preview || preview.existingReport) return;
      const d = await post<{ request?: { id: string }; existingReport?: { slug: string; title: string } }>("/requests", {
        providers: vendors,
        notes,
        consent,
      });
      if (d.existingReport) {
        setPreview({ ...preview, existingReport: d.existingReport });
        setConsent(false);
        return;
      }
      if (!d.request?.id) throw new Error("The request could not be confirmed. Please try again.");
      setRequestId(d.request.id);
      setStep(4);
    });
  const phase = step <= 1 ? 0 : step === 2 ? 1 : 2;
  return (
    <main id="main" className="shell request-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        Report library
      </Link>
      <div className="request-grid">
        <aside>
          <p className="eyebrow">A NEW COMPARISON</p>
          <h1>
            Put the answers
            <br />
            to the test.
          </h1>
          <p className="intro">
            Two providers. Three storefronts each.
            <br />
            One published quality rubric.
          </p>
          <ol className="steps">
            {[
              "Verify your work email",
              "Choose providers & storefronts",
              "Review & submit",
            ].map((s, i) => (
              <li
                key={s}
                className={i === phase ? "current" : i < phase ? "done" : ""}
              >
                <span>{i < phase ? <Check size={16} /> : i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="aside-note">
            <ShieldCheck size={22} />
            <p>
              Every request is reviewed before testing starts. Approved
              comparisons use the same questions and scoring rules.
            </p>
            <Link href="/methodology">
              Read the methodology <ExternalLink size={13} />
            </Link>
          </div>
          {prior.length > 0 && (
            <div className="prior-requests">
              <h3>Your requests</h3>
              {prior.map((r) => (
                <Link key={r.id} href={`/requests/${r.id}`}>
                  {r.providers.map((v) => v.name).join(" vs. ")}
                  <small>{r.status.replaceAll("_", " ")}</small>
                </Link>
              ))}
            </div>
          )}
        </aside>
        <section className="form-panel" aria-labelledby="flow-heading">
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {step === 0 && (
            <form onSubmit={start}>
              <div className="form-icon">
                <Mail />
              </div>
              <p className="eyebrow">STEP 01</p>
              <h2 id="flow-heading">First, your work email.</h2>
              <p className="muted">
                We’ll send a six-digit code to verify your mailbox. Your contact
                details stay private.
              </p>
              <label className="field">
                Your name
                <Input
                  required
                  maxLength={100}
                  autoComplete="name"
                  disabled={busy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                />
              </label>
              <label className="field">
                Work email
                <Input
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  disabled={busy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                />
              </label>
              <p className="field-hint">
                Use your company email address. Personal and known disposable
                email addresses aren’t accepted.
              </p>
              <Button className="primary-button full" disabled={busy}>
                {busy ? "Requesting code…" : "Send verification code"}
                <ArrowRight size={16} />
              </Button>
              <p className="fine-print">
                We use your email for verification and request updates.{" "}
                <Link href="/privacy">Privacy policy</Link>
              </p>
            </form>
          )}
          {step === 1 && (
            <form onSubmit={verify}>
              <div className="form-icon">
                <Mail />
              </div>
              <p className="eyebrow">CHECK YOUR INBOX</p>
              <h2 id="flow-heading">Enter your verification code.</h2>
              <p className="muted">
                Verification for <strong>{email}</strong>. The code expires in
                ten minutes.
              </p>
              <label className="field" htmlFor="verification-code">
                Six-digit code
              </label>
              <InputOTP
                id="verification-code"
                maxLength={6}
                pattern="^[0-9]*$"
                value={code}
                disabled={busy}
                onChange={setCode}
                autoComplete="one-time-code"
                inputMode="numeric"
                aria-label="Six-digit verification code"
              >
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, i) => (
                    <InputOTPSlot className="otp-cell" key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <Button
                className="primary-button full"
                disabled={busy || code.length !== 6}
              >
                {busy ? "Verifying…" : "Verify & continue"}
                <ArrowRight size={16} />
              </Button>
              <div className="form-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => start()}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setStep(0);
                    setNotice("");
                  }}
                >
                  Use another email
                </button>
              </div>
            </form>
          )}
          <form hidden={step !== 2} onSubmit={review}>
              <div className="verified-line">
                <Check size={16} />
                {user?.email} verified
                <button
                  className="text-button"
                  style={{ marginLeft: "auto" }}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/auth/session", { method: "DELETE" });
                      setUser(null);
                      setPrior([]);
                      setStep(0);
                    })
                  }
                >
                  Sign out
                </button>
              </div>
              <p className="eyebrow">STEP 02</p>
              <h2 id={step === 2 ? "flow-heading" : undefined}>What should we compare?</h2>
              <p className="muted">
                Enter two AI providers and three customer storefronts where each
                is deployed. Include the exact storefront URLs where the live
                chat is available. We’ll look for published analyses as you type.
              </p>
              {vendors.map((vendor, index) => (
                <ProviderFields key={index} index={index} value={vendor}
                  active={step === 2 && !busy} onChange={updateVendor} />
              ))}
              <label className="field">
                Anything the reviewer should know?{" "}
                <span className="optional">Optional</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="For example, where to find the chat, regional storefront differences, or evidence of the provider deployment."
                />
              </label>
              <Button className="primary-button full" disabled={busy}>
                {busy ? "Checking existing comparisons…" : "Review comparison"}
                <ArrowRight size={16} />
              </Button>
            </form>
          {step === 3 && (
            <div>
              <p className="eyebrow">STEP 03</p>
              <h2 id="flow-heading">{preview?.existingReport ? "This comparison is already available." : "Ready for review."}</h2>
              <p className="muted">
                {preview?.existingReport
                  ? "These providers and storefronts already have a published comparison. You can explore its results now."
                  : "Check the companies, storefronts and planned work below. Each comparison covers 12 conversations under the published rubric."}
              </p>
              {preview && <ReuseSummary preview={preview} />}
              <ComparisonDetails vendors={vendors} />
              {notes && <p className="review-note">{notes}</p>}
              {!preview?.existingReport && <>
              <div className="request-scope">
                <strong>What happens next</strong>
                <p>
                  A reviewer checks your request. If approved, we email you and
                  reuse eligible published evidence and test the remaining
                  storefronts. A complete report that passes validation
                  is published, and we email you its link. Incomplete or blocked
                  runs do not publish.
                </p>
              </div>
              <label className="checkbox-label">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                />
                <span>
                  I understand that this comparison, its storefronts and test
                  evidence will be public if completed. My name and email remain
                  private.
                </span>
              </label>
              </>}
              <div className="form-actions">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft size={16} />
                  Edit details
                </Button>
                {!preview?.existingReport && <Button
                  className="primary-button"
                  disabled={busy || !consent || !preview}
                  onClick={submit}
                >
                  {busy ? "Submitting…" : "Submit for approval"}
                  <ArrowRight size={16} />
                </Button>}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="success-panel">
              <span className="success-icon">
                <Check size={28} />
              </span>
              <p className="eyebrow">REQUEST RECEIVED</p>
              <h2 id="flow-heading">Your comparison is in review.</h2>
              <p>
                We’ll email <strong>{email}</strong> after a decision, and again
                when a completed report is published.
              </p>
              <Link className="button primary" href={`/requests/${requestId}`}>
                View request status <ArrowRight size={16} />
              </Link>
              <Link className="text-link" href="/">
                Back to the report library
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
function ProviderFields({ index, value, active, onChange }: {
  index: number;
  value: Vendor;
  active: boolean;
  onChange: (index: number, value: Vendor) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [lookup, setLookup] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const latest = useRef(value);
  const edited = useRef(new Set<string>());
  const autofilled = useRef<FilledFields>({});
  const source = useRef<CatalogProvider | null>(null);
  useEffect(() => { latest.current = value; }, [value]);

  useEffect(() => {
    if (!active) return;
    const query = providerLookupQuery(value);
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookup("loading");
      try {
        const result = await api<{ providers: CatalogProvider[] }>(`/providers?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setCatalog(result.providers);
        setLookup("done");
        const match = certainProvider(latest.current, result.providers);
        if (match) {
          const filled = fillKnownProvider(latest.current, match, edited.current);
          source.current = match;
          autofilled.current = { ...autofilled.current, ...filled.filled };
          if (Object.keys(filled.filled).length) {
            latest.current = filled.value;
            onChange(index, filled.value);
          }
        }
      } catch {
        if (!controller.signal.aborted) { setCatalog([]); setLookup("failed"); }
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, index, value.name, value.website, onChange]);

  function change(field: "name" | "website", text: string, customer?: number) {
    let next = latest.current;
    const key = customer === undefined ? field : `customers.${customer}.${field}`;
    edited.current.add(key);
    delete autofilled.current[key];
    if (customer === undefined) {
      const candidate = { ...next, [field]: text };
      if (source.current && !matchesProvider(candidate, source.current)) {
        next = removeAutofill(next, autofilled.current);
        autofilled.current = {};
        source.current = null;
      }
      next = { ...next, [field]: text };
      setCatalog([]);
      setLookup("idle");
    } else {
      next = { ...next, customers: next.customers.map((entry, i) => i === customer ? { ...entry, [field]: text } : entry) };
    }
    latest.current = next;
    onChange(index, next);
  }

  function applyProvider(provider: CatalogProvider) {
    const cleared = removeAutofill(latest.current, autofilled.current);
    const filled = fillKnownProvider({ ...cleared, name: provider.name, website: provider.website }, provider, edited.current);
    source.current = provider;
    autofilled.current = { name: provider.name, website: provider.website, ...filled.filled };
    latest.current = filled.value;
    onChange(index, filled.value);
  }
  const match = certainProvider(value, catalog);
  const searched = value.name.trim().length >= 2 || value.website.trim().length >= 2;
  return (
    <fieldset className="vendor-fieldset" disabled={!active}>
      <legend><span>{index === 0 ? "A" : "B"}</span>Provider {index + 1}</legend>
      <div className="field-row">
        <label className="field">Provider name
          <Input required maxLength={100} value={value.name} onChange={event => change("name", event.target.value)} placeholder={index === 0 ? "e.g. Alhena" : "e.g. Gorgias"} />
        </label>
        <label className="field">Provider website
          <Input required type="url" maxLength={2048} value={value.website} onChange={event => change("website", event.target.value)} placeholder="https://provider.com" />
        </label>
      </div>
      <div aria-live="polite" className="text-sm">
        {lookup === "loading" && <p className="muted">Looking for published analyses…</p>}
        {lookup === "failed" && <p className="muted">Suggestions are temporarily unavailable. You can enter the storefronts below; we’ll check for existing evidence before submission.</p>}
        {lookup === "done" && searched && catalog.length === 0 && <p className="muted">No published provider match yet. Add the storefronts you want evaluated.</p>}
      </div>
      {match ? (
        <div className="request-scope" aria-label={`Published analyses for ${match.name}`}>
          <strong>Published analyses for {match.name}</strong>
          <p>Known storefronts fill available fields. You can edit any detail. Only compatible analyses from the last 30 days can be reused.</p>
          <ul className="mt-3 space-y-3 text-sm">
            {match.customers.slice(0, 6).map((customer, i) => (
              <li key={`${customer.website}-${i}`}>
                <span className="font-semibold">{customer.name}</span>
                {(["shopping", "support"] as const).map(mode => typeof customer[mode] === "number" && <span key={mode} className="block text-slate-600">
                  {mode === "shopping" ? "Shopping" : "Support"} {customer[mode]}/100 · {analysisDate(customer.analyses?.[mode]?.capturedAt || customer.analyses?.[mode]?.date || customer.capturedAt || customer.date)}
                </span>)}
                {(customer.reusable === false || (customer.reusable === undefined && analysisExpired(customer.capturedAt || customer.date))) && <span className="block text-amber-800">New testing required under the 30-day reuse policy.</span>}
                {customer.sourceReportSlug && <Link className="text-link" href={`/reports/${encodeURIComponent(customer.sourceReportSlug)}`}>View source report <ExternalLink size={12} /></Link>}
              </li>
            ))}
          </ul>
        </div>
      ) : catalog.length > 0 && (
        <div className="request-scope">
          <strong>Existing providers that may match</strong>
          <p>Choose a match to use its details, or keep entering your own.</p>
          <div className="mt-3 flex flex-col gap-3">
            {catalog.slice(0, 3).map((provider, i) => <Button key={`${provider.website}-${i}`} type="button" variant="outline" className="h-auto whitespace-normal py-3 text-left" onClick={() => applyProvider(provider)}>
              Use {provider.name} · {provider.website}
            </Button>)}
          </div>
        </div>
      )}
      <p className="storefront-label">THREE CUSTOMER STOREFRONTS</p>
      {value.customers.map((customer, j) => <div className="customer-row" key={j}>
        <span className="customer-number">0{j + 1}</span>
        <label className="field">Customer name
          <Input required maxLength={100} aria-label={`Provider ${index + 1}, customer ${j + 1} name`} value={customer.name} onChange={event => change("name", event.target.value, j)} placeholder="Company name" />
        </label>
        <label className="field">Storefront URL
          <Input required type="url" maxLength={2048} aria-label={`Provider ${index + 1}, customer ${j + 1} storefront URL`} value={customer.website} onChange={event => change("website", event.target.value, j)} placeholder="https://store.com" />
        </label>
      </div>)}
    </fieldset>
  );
}

function analysisDate(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "Published analysis";
  return `Analyzed ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value))}`;
}
function analysisExpired(value?: string) {
  return Boolean(value && Number.isFinite(Date.parse(value)) && Date.now() - Date.parse(value) > 30 * 86_400_000);
}

function ReuseSummary({ preview }: { preview: ReusePreview }) {
  if (preview.existingReport) return <div className="request-scope" role="status">
    <strong>Already completed. No new request is needed.</strong>
    <p><Link className="button primary" href={`/reports/${encodeURIComponent(preview.existingReport.slug)}`}>{preview.existingReport.title} <ArrowRight size={16} /></Link></p>
  </div>;
  return <div className="request-scope" role="status">
    <strong>What is already covered, and what is new</strong>
    {preview.previousReport && <p>An earlier comparison exists, but its evidence needs refreshing. <Link className="text-link" href={`/reports/${encodeURIComponent(preview.previousReport.slug)}`}>View {preview.previousReport.title} <ExternalLink size={12} /></Link></p>}
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div><span className="block text-2xl font-semibold">{preview.reusedConversations}</span><span className="text-sm">conversations reused</span><p>{preview.reusedStores} storefronts are fully covered by existing evidence.</p></div>
      <div><span className="block text-2xl font-semibold">{preview.newConversations}</span><span className="text-sm">new conversations</span><p>{preview.newStores} storefronts need new testing after approval.</p></div>
    </div>
    <p>Only compatible evidence from the last 30 days is reused, with its original analysis date and source. The reviewer confirms the plan before any new testing starts.</p>
  </div>;
}

export function ComparisonDetails({ vendors }: { vendors: Vendor[] }) {
  return (
    <div className="comparison-details">
      {vendors.map((v, i) => (
        <div key={i}>
          <div className="provider-detail">
            <span className="provider-letter">{i === 0 ? "A" : "B"}</span>
            <div>
              <h3>{v.name}</h3>
              <a href={safeUrl(v.website)} target="_blank" rel="noreferrer">
                {v.website}
              </a>
            </div>
          </div>
          <ol>
            {v.customers.map((c, j) => (
              <li key={j}>
                <strong>{c.name}</strong>
                <a href={safeUrl(c.website)} target="_blank" rel="noreferrer">
                  {c.website}
                  <ExternalLink size={13} />
                </a>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
function safeUrl(url: string) {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
