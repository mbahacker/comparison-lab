import Link from 'next/link';
import { POLICY_LABEL, POLICY_PROTOCOL } from '@/lib/policy-study';
import { POLICY_PROTOCOL as method } from '@/benchmark/policy-resolution.mjs';
import { listPolicyStudies } from '@/lib/server/policy-studies';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Policy-resolution v1 methodology',
  description: 'Alhena Research Lab’s versioned method for policy-compliant resolution, answer quality and full-answer speed in public storefront sessions.',
  alternates: { canonical: '/studies/policy-resolution-v1' },
};
export default function Page() {
  const published = listPolicyStudies().length > 0;
  return <main id="main" className="shell prose-page">
    <p className="eyebrow">ALHENA RESEARCH LAB · VERSIONED METHODOLOGY</p>
    <h1>{POLICY_LABEL}</h1>
    <p className="intro"><code>{POLICY_PROTOCOL}</code> measures whether an assistant provides a correct answer or a policy-prescribed next step for the request made in a public storefront session. Each study freezes its method before new judgments and reports its completion and publication status separately.</p>
    {!published && <p className="notice">No policy-resolution study has been approved for publication yet. This page describes the method, not completed results.</p>}
    <div className="caveat"><strong>What resolution means here.</strong><p>A merchant-prescribed escalation can be a successful response. It does not prove that a refund was issued, an order changed or a human finished the case. This Lab-authored method is distinct from Gorgias’s published automation metric.</p></div>

    <h2>What earns verified credit</h2>
    <p>Each submitted question is a checkpoint. Its expected outcome is specified before judging, without looking at the assistant’s answer. A checkpoint can earn one point when the response:</p>
    <ul>
      <li>Substantively answers the request without a material contradiction or an unsupported claim that an action completed.</li>
      <li>Provides the actionable next step prescribed by the merchant’s published procedure, including the correct destination and required information where specified.</li>
      <li>Requests information or authentication genuinely necessary for that request. It must advance the request; asking for order details instead of answering a general return-policy question does not qualify.</li>
    </ul>
    <p>A generic contact pointer, optional connection offer, unanswered request or unsupported completion claim earns no verified credit. A published contact option alone does not establish that human handling is required. Unavailable or ambiguous policy produces an unverified decision, not an assumed violation or compliance.</p>

    <h2>The same evidence rule for every provider</h2>
    <p>The reference corpus records each merchant’s policy URL, retrieval date, region, source hash, relevant excerpts and conflicting provisions. The assistant’s own answer is not its independent policy reference. Conflicts remain visible. Facts outside the gathered corpus are not claimed as independently verified.</p>
    <p>Alhena’s statement that its handoffs follow merchant instructions is a vendor attestation. The comparative scoring uses each merchant’s published guidelines as the common reference for every provider. Selected storefront configurations do not establish all deployments’ capabilities.</p>
    <p>Every attainment decision identifies the actual response turn and a quote present in that response, with relevant policy references. Necessary verification and appropriate routing do not establish downstream completion. Product efficacy, customer-review authenticity and conversion are not independently tested.</p>

    <h2>Observed evidence and missing evidence</h2>
    <p>Only assessable submitted checkpoints enter the conditional resolution denominator. A confirmed submission with no answer earns zero. Explicitly unsent placeholders are neither failed responses nor successes. Unknown submission or actor state is unassessable.</p>
    <p>Reports distinguish planned, attempted, observed, recorded-submitted, assessed, unverified and unassessable counts. Verified attainment as a fraction of all planned checkpoints is also disclosed. Short or stopped conversations are not described as fully observed ten-turn tests.</p>
    <p>Wrong-provider, unconfirmed-AI, inaccessible and unresolved harness-failure records are identified separately. FAQ text is not silently counted as successful AI resolution. A completed study accounts for every registered context, including exclusions and failures. Guardrail probes remain separate and do not enter the composite.</p>

    <h2>Original and repaired captures</h2>
    <p>Original studies and scores remain immutable. A separate repair register uses a company-neutral cause rule: a conversation stopped solely because ordinary AI text was mistaken for human takeover, without independent evidence of actual transfer. Every selected repair is retained, including worse results. Poor answers, legitimate handoffs, login requirements and ordinary unavailability are not reasons to retry.</p>
    <p>The capture process distinguishes a referral from actual takeover. It does not submit tickets, invent order credentials or send scripted questions to a human. A footer, policy instruction or optional connection offer does not establish human authorship. Original questions, browser timing and resource settings are retained. Repaired captures receive new timestamps and hashes and never replace the old study’s raw evidence.</p>

    <h2>Primary judgment and full blind audit</h2>
    <p>Every policy-resolution checkpoint receives a fresh primary judgment and a separate fresh audit that does not see the primary decision. Names are masked where practicable; complete anonymity is not claimed. Both judgments must award attainment with valid evidence for verified credit.</p>
    <p>Disagreement over attainment remains unverified and earns zero verified credit. There is no favorable tie-break or selective third judgment. If both judges agree that the request was attained but classify its handling differently, credit remains and that classification difference is disclosed. Quotes, references, runtime provenance and corrections are retained.</p>
    <p>Invalid quotes or policy references cannot earn verified credit. Evidence validation retains those decisions as unverified with the validation flags visible; it does not discard them or ask again for a favorable verdict. Missing accepted judgments, unresolved capture repairs and incomplete audits block a final result. Quality judgments for unchanged captures retain their original provenance; repaired captures require fresh quality judgment and audit.</p>

    <h2>Distinct components and composite weights</h2>
    <p>PCR is the percentage of assessed checkpoints with verified attainment, averaged within each conversation, then across conversations within each storefront, then equally across storefronts within each provider. Raw numerator and denominator counts remain visible. This is not a pooled percentage that gives longer conversations more weight.</p>
    <p>The 26 original shopping and support answer-quality criteria remain a separate component with their original weights and evidence gates. Full-answer completion timing is separate from resolution. A composite is labeled as a composite, never as quality.</p>
    <div className="data-table-wrap"><table className="data-table"><caption>Policy-resolution composite weights</caption><thead><tr><th>Lane</th><th>PCR</th><th>Quality</th><th>Speed</th></tr></thead><tbody>{(['shopping', 'support'] as const).map(lane => {
      const weights = method[lane === 'shopping' ? 'shoppingWeights' : 'supportWeights'];
      return <tr key={lane}><th>{lane === 'shopping' ? 'Shopping' : 'Support'}</th><td>{weights.resolution * 100}%</td><td>{weights.quality * 100}%</td><td>{weights.speed * 100}%</td></tr>;
    })}</tbody></table></div>
    <p>Speed decreases linearly from 100 at three seconds to zero at 22 seconds, bounded to that range. The weights retain continuity with the original benchmark, but replacing automation changes what the composite measures.</p>
    <p>PCR and composites display one decimal. Quality retains staged rounding: store means, then the provider mean, to whole points. Completion time retains staged rounding: pooled store means to milliseconds, then seconds to one decimal, then the equal-store mean to one decimal. Speed and composites use the resulting components without an additional intermediate display-rounding step. The overall composite is the mean of the two unrounded lane composites.</p>

    <h2>Coverage floors</h2>
    <p>Each provider needs at least {method.minimumRegisteredStorefrontsPerProvider} registered storefronts, with all ten core themes accounted for at every store. A headline lane composite requires at least {method.minimumScorableConversationsPerLane} scorable conversations, {method.minimumScorableConversationsPerLane} quality-eligible conversations, {method.minimumScorableConversationsPerLane} timing-eligible conversations and {method.minimumObservedStorefrontsPerLane} storefronts with resolution observations.</p>
    <p>Individual component scores can still be inspected when a lane is ineligible. A missing or ineligible lane prevents an overall composite. These floors do not establish representativeness. Every report discloses effective context and storefront coverage, exclusions, source dates and its exact method hash.</p>

    <h2>Publication and reuse</h2>
    <p>Alhena operates and commissions this research. It is not independent third-party certification or a universal vendor ranking. Public summaries and this method are open; detailed evidence uses a verified work email. The first revised results must be reviewed before publication. Partial scores are not presented as completed results.</p>
    <p>Existing <Link href="/methodology">quality-pilot-v1 reports</Link> keep their original labels and are not silently combined with this method. Compatible evidence reuse is limited to {method.reuseDays} days from its original capture date. An approved study provides its exact hash-pinned method as a download.</p>
    <Link href="/studies">Back to policy-resolution studies</Link>
  </main>;
}
