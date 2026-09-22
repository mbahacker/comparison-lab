// Pure declarations extracted verbatim from Gorgias runner/judge-api.mjs at 19b1420d2520d48baa52be81ac33fc4b9bd0ff8b.
// Source SHA-256 b1c42c412c786ac3886d9559da86dcdbbf4a462b819f7f51e6fbe72f5e2c7293; see ATTRIBUTION.md.
const CHECKS = {
  shopping: ["a_direct", "a_consistent", "a_no_ignored", "d_clarify", "d_progressive", "d_not_dump",
             "r_named", "r_fit", "r_plausible", "e_price", "e_link", "e_reviews", "e_options",
             "c_cta", "c_cart", "c_clean"],
  support: ["s_answered", "s_outcome", "s_no_deflect", "g_specific", "g_consistent", "g_grounded",
            "t_steps", "t_complete", "k_expectations", "k_clean"],
};

const schemaFor = (mode) => ({
  type: "object",
  properties: {
    checks: {
      type: "object",
      properties: Object.fromEntries(CHECKS[mode].map((c) => [c, {
        type: "object",
        properties: {
          pass: { type: "boolean" },
          evidence: { type: "string", description: "Short VERBATIM quote from the transcript. Required when pass is true — it is verified against the transcript in code and the check is failed if the quote is not found." },
        },
        required: ["pass", "evidence"],
        additionalProperties: false,
      }])),
      required: CHECKS[mode],
      additionalProperties: false,
    },
    resolution_class: { type: "string", enum: ["resolved", "partial", "deflected", "failed"] },
    learning: { type: "string", description: "One concise sentence: the standout strength or gap." },
  },
  required: ["checks", "resolution_class", "learning"],
  additionalProperties: false,
});

const INSTRUCTIONS = `You are a blind quality judge for an e-commerce AI-agent benchmark.

You will receive ONE conversation between a shopper and a store's AI chat agent. Score it against
the rubric above, for the lane given in the conversation's \`mode\` field.

Rules that matter most:
- You are BLIND on purpose. Vendor and store names are masked ("the store"). Score the behaviour in
  front of you. Never speculate about which product or vendor this is, and never let a guess affect
  a check.
- Every check for the lane must appear in your output.
- A check may only pass if you can cite a SHORT VERBATIM quote from this transcript. The quote is
  verified programmatically against the transcript text; if it is not found character-for-character
  (whitespace and quote-style normalised), the check is recorded as FAILED. So quote exactly, and
  copy from the transcript rather than paraphrasing. Use "..." only to elide a middle section.
- For a failing check, leave evidence as an empty string or a brief reason. Only passes need quotes.
- \`signals\` are deterministic regex measurements of the transcript (price/link/review/option
  presence, and whether the conversation was a channel deflection). They are enforced as caps at
  merge time regardless of what you say, so do not pass a rich-element check whose signal is false.
- Judge only what the assistant could see: a cold session, no account, no order history. Apply the
  hindsight self-check before failing a check.
- A justified, well-executed handover is \`partial\`, not \`failed\`.
- Substance over style. Warmth, enthusiasm and emojis are not substance (rubric v2.3).`;

// ── evidence verification ────────────────────────────────────────────────────────
// Judges legitimately normalise curly quotes, collapse whitespace, and elide with "...". Those are
// faithful quotation, so normalise both sides before comparing rather than demanding byte equality —
// otherwise the guard would strip credit from honest judges and teach us nothing about dishonest
// ones. Everything else (a paraphrase, an invented sentence) fails.
const norm = (s) => String(s || "")
  .replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"')
  .replace(/[–—−]/g, "-").replace(/ | | /g, " ")
  .replace(/\s+/g, " ").trim().toLowerCase();

function evidenceFound(quote, haystack) {
  const q = norm(quote);
  if (q.length < 3) return false;
  const h = norm(haystack);
  if (h.includes(q)) return true;
  // elision: every fragment long enough to be meaningful must appear, in order
  const parts = q.split(/\s*(?:\.\.\.|…)\s*/).map((p) => p.trim()).filter((p) => p.length >= 8);
  if (parts.length < 2) return false;
  let at = 0;
  for (const p of parts) {
    const i = h.indexOf(p, at);
    if (i < 0) return false;
    at = i + p.length;
  }
  return true;
}


// Shared by the worker and private judge's exact schema allowlist.
function qualityAuditSchema(mode) {
  const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const string = { type: 'string' };
  return object({ audit: object(Object.fromEntries(CHECKS[mode].map(id => [id, object({
    classification: { type: 'string', enum: ['AGREE', 'FALSE_POSITIVE', 'FALSE_NEGATIVE'] },
    evidence: string, reason: string, trap: string,
  })]))) });
}

export {CHECKS,schemaFor,INSTRUCTIONS,evidenceFound,qualityAuditSchema};
