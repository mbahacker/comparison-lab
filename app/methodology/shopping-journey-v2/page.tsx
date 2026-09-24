import Link from 'next/link';
import { jsonLd, pageStructuredData } from '@/lib/server/public-data';
import contract from '@/rubric/shopping-journey-v2.json';

const description = 'Shopping outcomes across the storefront, with a separate score for usable shopping interfaces. The versioned framework preserves existing chat and support scores.';
export const metadata = {
  title: 'Shopping journey v2 methodology', description,
  alternates: { canonical: '/methodology/shopping-journey-v2' },
};

export default function Page() {
  return <main id="main" className="shell prose-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageStructuredData({ type: 'TechArticle', path: '/methodology/shopping-journey-v2', headline: 'Shopping journey v2 methodology', description, crumbs: [{ name: 'Methodology', path: '/methodology' }, { name: 'Shopping journey v2', path: '/methodology/shopping-journey-v2' }] })) }} />
    <p className="eyebrow">ALHENA RESEARCH LAB · VERSIONED SHOPPING FRAMEWORK</p>
    <h1>Shopping happens across the storefront.</h1>
    <p className="intro"><code>shopping-journey-v2</code> evaluates what shoppers can accomplish and where they can access usable shopping assistance. It reports two separate scores: <strong>shopping outcomes</strong> and <strong>usable shopping reach</strong>. Neither is a replacement label for the existing chat composite.</p>
    <div className="notice"><strong>Framework published; no results under this version yet.</strong><p>The framework and evidence scoring rules are available. Automated capture across these interfaces is not yet enabled. Current submissions still run <Link href="/studies/policy-resolution-v1">policy-resolution-v1</Link>. Existing scores have not been recalculated, and support scoring is unchanged.</p></div>

    <h2>Two dimensions, shown separately</h2>
    <p>More usable ways to access shopping assistance count toward shopping reach. Successful tasks count toward shopping outcomes. A tool can have broad reach and weak outcomes, or strong outcomes through fewer interfaces; the report keeps that distinction visible. There is no combined score or extra bonus for the number of widget instances.</p>
    <p>Each evaluation registers five customer storefronts before testing. A study freezes its tasks, shopper constraints, primary routes, success conditions, observation flows and evidence requirements in advance and applies them consistently to each provider. Fallback attempts remain separate; the evaluator does not select a winning route after seeing results. The results describe those deployments, rather than every configuration the vendor offers.</p>

    <h2>Shopping outcomes: six equally weighted tasks</h2>
    <div className="data-table-wrap"><table className="data-table"><caption>Six tasks per storefront, thirty task cells across five stores</caption><thead><tr><th scope="col">Task</th><th scope="col">Observable outcome</th></tr></thead><tbody>{contract.outcomes.map(task => <tr key={task.id}><th scope="row">{task.label}</th><td>{task.success}</td></tr>)}</tbody></table></div>
    <p>Each assessable task earns binary credit for verified completion. A primary judgment and a separate audit must both support completion with valid evidence. A confirmed failure earns zero. A disagreement between the primary judgment and blind audit receives no verified completion credit and is disclosed. Unknown or blocked observations remain explicitly unresolved; they are not silently scored as zero or removed from the denominator.</p>
    <p>A headline outcome score is available only when all thirty task cells are assessable and audited. It is <strong>100 × verified completions ÷ 30</strong>, equivalent to averaging the six equally weighted tasks within each store and then averaging the five stores. Until then, the report shows coverage and the verified lower bound against all thirty planned tasks, not a completed headline score.</p>
    <p>An assistant saying “added to cart” is insufficient. The cart-action task requires evidence of the actual cart state before and after the requested change. Continuity requires evidence that relevant context survives a transition; it does not require a vendor to offer additional widgets. Ordinary storefront navigation can be part of that transition. Testing stops before placing an order.</p>

    <h2>Usable shopping reach: five interface types</h2>
    <div className="data-table-wrap"><table className="data-table"><caption>Each distinct interface type represents 20% of a storefront’s reach score</caption><thead><tr><th scope="col">Interface</th><th scope="col">What is inspected</th></tr></thead><tbody>{contract.interfaces.map(surface => <tr key={surface.id}><th scope="row">{surface.label}</th><td>{surface.description}</td></tr>)}</tbody></table></div>
    <p>Discovery follows the homepage, a relevant category or search, a representative product page and a cart with a test item. Ordinary cookie consent and any blockers are recorded.</p>
    <p>An interface counts only when it is attributable to the evaluated provider and a retained test demonstrates that a shopper can use it for its intended shopping purpose. Merely finding a button, widget or vendor marketing claim does not establish usability. Multiple placements of the same interface type count once per storefront.</p>
    <div className="data-table-wrap"><table className="data-table"><caption>Every interface observation retains its status and evidence</caption><thead><tr><th scope="col">Status</th><th scope="col">Meaning</th><th scope="col">Scoring treatment</th></tr></thead><tbody>
      <tr><th scope="row">Usable</th><td>Attribution and an actual usability test are verified.</td><td>Earns credit for that type.</td></tr>
      <tr><th scope="row">Present, untested</th><td>A surface was found but its required test is incomplete.</td><td>Unresolved; no headline reach score.</td></tr>
      <tr><th scope="row">Not observed</th><td>The interface was not observed in the sampled flow after the prescribed checks.</td><td>No credit for that type in this sample.</td></tr>
      <tr><th scope="row">Blocked</th><td>Access, attribution or observation could not be resolved.</td><td>Unresolved; no headline reach score.</td></tr>
    </tbody></table></div>
    <p>The reach score is the mean of the five storefront scores: <strong>100 × verified usable interface cells ÷ 25</strong>. It is available only when every cell is resolved as usable or not observed. Otherwise, the score stays unavailable and the report shows the verified lower bound against all twenty-five cells alongside the unresolved inventory.</p>
    <p>“Not observed” always means <strong>not observed in the sampled flow</strong>. It is not proof that a vendor lacks that capability. Product-page placement, the steps needed to open an interface and other interaction costs are recorded descriptively. This study does not establish actual adoption, increased conversion or a vendor’s intent or strategic focus.</p>

    <h2>Evidence, fresh runs and comparisons</h2>
    <p><a href="/methodology/shopping-journey-v2/contract.json">Read the machine-readable framework and protocol hash</a>. These task definitions and interface descriptions come from the same contract used by the evidence scorer.</p>
    <p>Evidence identifies the storefront, page and interface; capture time; provider attribution; task and success condition; observed action and resulting state; and the primary judgment and audit. A report retains unknowns, failed tasks and capture limitations. Interface inventory remains distinct from vendor claims about available products.</p>
    <p>Fresh shopping evidence is required for this version. Prior chat transcripts cannot establish product-page behavior, verified cart changes or continuity across interfaces. Compatible reuse remains limited to thirty days from original capture, with the same framework, task plan and execution requirements. Republishing does not reset evidence age.</p>
    <p>Shopping journey scores are compared only with results from this same version under compatible conditions. They are not combined with prior shopping composites or used to recalculate support scores. Public summaries and the methodology remain open; detailed evidence requires a verified work email.</p>
    <div className="hero-actions"><Link className="button primary" href="/methodology">All research methods</Link><Link className="button outline-button" href="/studies">Published studies</Link></div>
  </main>;
}
