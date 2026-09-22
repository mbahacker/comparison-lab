import Link from 'next/link';
import { POLICY_PROTOCOL as method } from '@/benchmark/policy-resolution.mjs';

export const metadata = {
  title: 'Research methodology and scoring',
  description: 'How Alhena Research Lab measures policy-compliant resolution, answer quality and speed, and combines them into shopping and support composite scores.',
  alternates: { canonical: '/methodology' },
};

export default function Page() {
  return <main id="main" className="shell method-page">
    <p className="eyebrow">ALHENA RESEARCH LAB · METHODOLOGY</p>
    <h1>What the scores measure.</h1>
    <p className="intro">The current research library uses <strong>policy-resolution-v1</strong>. Shopping and support composite scores combine three distinct measures: policy-compliant resolution, answer quality and full-answer speed.</p>
    <div className="method-grid">
      <section className="method-card"><h2>Policy-compliant resolution</h2><p>Did the assistant give a correct answer or the actionable next step required by the merchant’s published policy? A required handoff can earn credit when the response fulfills the request under that policy.</p></section>
      <section className="method-card"><h2>Answer quality</h2><p>The original 26 published quality criteria, with fixed weights: 16 for shopping and 10 for support. Quality is a separate component, not the composite score.</p></section>
      <section className="method-card"><h2>Full-answer speed</h2><p>Time until the full answer is complete. The speed score ranges from 100 at three seconds to zero at 22 seconds, bounded between zero and 100.</p></section>
      <section className="method-card"><h2>Evidence and audit</h2><p>Every assessed resolution checkpoint receives a primary judgment and a separate blind audit. Both must award valid evidence-backed attainment for verified credit. Disagreements and exclusions remain visible.</p></section>
    </div>
    <section><h2>How the composite is calculated</h2><div className="data-table-wrap"><table className="data-table"><caption>Composite weights by lane</caption><thead><tr><th>Lane</th><th>Policy-compliant resolution</th><th>Answer quality</th><th>Speed</th></tr></thead><tbody>{(['shopping', 'support'] as const).map(lane => {
      const weights = method[lane === 'shopping' ? 'shoppingWeights' : 'supportWeights'];
      return <tr key={lane}><th>{lane === 'shopping' ? 'Shopping' : 'Support'}</th><td>{weights.resolution * 100}%</td><td>{weights.quality * 100}%</td><td>{weights.speed * 100}%</td></tr>;
    })}</tbody></table></div><p>Overall is the equal mean of the two unrounded lane composites, available only when both lanes meet the published coverage requirements.</p></section>
    <section className="library-method-note"><h2>Sample and coverage</h2><p>Each provider has at least {method.minimumRegisteredStorefrontsPerProvider} registered storefronts and ten core themes per storefront. Headline lane composites require at least {method.minimumScorableConversationsPerLane} eligible conversations and {method.minimumObservedStorefrontsPerLane} storefronts with resolution observations. Each report shows the actual included and excluded sample.</p><p>These are selected public storefront sessions. Resolution can include a policy-prescribed next step; it does not establish a completed refund, account change or human-resolved case. Alhena commissions and operates this research.</p></section>
    <div className="hero-actions"><Link className="button primary" href="/studies/policy-resolution-v1">Read the complete current methodology</Link><Link className="button outline-button" href="/studies">Browse the studies</Link></div>
    <section className="library-section"><h2>Current submissions and the historical pilot</h2><p>The earlier <strong>quality-pilot-v1</strong> reports retain their original scores and dates in the historical archive. They cover three storefronts and two question themes per tool, measuring quality only. Their scores are not combined with the current study’s composites.</p><p>New “Analyze your tool” submissions use the current five-storefront policy-resolution method. After approval, the runner captures all ten core themes and a separate guardrail conversation per storefront. Validated results update the current library automatically; older quality-pilot jobs retain their frozen scope.</p><div className="hero-actions"><Link className="button outline-button" href="/methodology/quality-pilot-v1">Quality-pilot method and all 26 criteria</Link><Link className="text-link" href="/#archive">Historical quality archive</Link></div></section>
  </main>;
}
