import { date } from "@/lib/client";
import { CAPABILITIES, PRODUCT_SCOPE_CHECKED_AT, notComparedOfferings, scopesFor, vendorScope, type ScopeCell, type VendorScope } from "@/lib/product-scope";
import { DemoLink } from "./demo-link";

type Provider = { name: string; website: string };


function Cell({ cell, vendor }: { cell: ScopeCell; vendor: VendorScope }) {
  if (cell.status === "not-listed") return <td className="scope-cell is-missing">Not listed on {vendor.domain}</td>;
  const text = cell.status === "integration" ? `Via integrations${cell.product ? `: ${cell.product}` : ""}` : cell.product || "Yes";
  return <td className={`scope-cell ${cell.status === "integration" ? "is-integration" : "is-yes"}`}>{cell.source ? <a href={cell.source} target="_blank" rel="noopener">{text}</a> : text}</td>;
}

export function ProductScope({ providers }: { providers: Provider[] }) {
  const vendors = scopesFor(providers);
  const alhena = vendors?.some(v => v.id === "alhena");
  return <section className="study-section study-scope" id="product-scope" aria-labelledby="product-scope-title">
    <div className="shell">
      <div className="section-intro">
        <h2 id="product-scope-title">This study covers the chat widget only</h2>
        <p>Studies test one form factor: the AI agent in each store’s on-site chat widget. {vendors ? "Both vendors sell more than that. The table lists what each one publicly offers, from its own website" : "Other products the vendors sell are outside its scope"}{vendors && <> as of <time dateTime={PRODUCT_SCOPE_CHECKED_AT}>{date(PRODUCT_SCOPE_CHECKED_AT)}</time>. It is not part of this study’s testing</>}.</p>
      </div>
      {vendors && <div className="data-table-wrap"><table className="data-table scope-table">
        <caption>Publicly listed products by vendor, linked to the page that lists each one. Only the rows marked “Tested” are measured by this study.</caption>
        <thead><tr><th scope="col">Capability</th>{vendors.map(v => <th scope="col" key={v.id}>{v.name}</th>)}<th scope="col">In this study</th></tr></thead>
        <tbody>{CAPABILITIES.map(row => <tr key={row.key} className={row.tested === true ? "is-tested" : undefined}>
          <th scope="row">{row.label}</th>
          {vendors.map(v => <Cell key={v.id} cell={v.cells[row.key] ?? { status: "not-listed" }} vendor={v} />)}
          <td>{row.tested === true ? "Tested" : row.tested === "partly" ? "Only inside chat conversations" : "Not tested"}</td>
        </tr>)}</tbody>
      </table></div>}
      {alhena && <div className="scope-offers">
        <h3>Alhena products this study doesn’t compare</h3>
        <ul>{notComparedOfferings().map(o => <li key={o.title}><a href={o.href} target="_blank" rel="noopener">{o.title}</a><span>{o.description}</span></li>)}</ul>
        <DemoLink placement="study_scope" className="btn btn-secondary">See them in a demo</DemoLink>
      </div>}
    </div>
  </section>;
}

/** Short list for a tool profile: what else this vendor publicly offers, outside the tested chat widget. */
export function BeyondChatWidget({ website, name }: Provider) {
  const vendor = vendorScope(website);
  if (!vendor) return null;
  const other = CAPABILITIES.filter(row => row.tested === false && vendor.cells[row.key] && vendor.cells[row.key].status !== "not-listed");
  if (!other.length) return null;
  return <section className="library-section scope-profile" aria-labelledby="beyond-widget">
    <h2 id="beyond-widget">Beyond the chat widget</h2>
    <p>These scores cover {name}’s AI agent in the on-site chat widget only. {name} also publicly lists the following, which the Lab has not tested (checked <time dateTime={PRODUCT_SCOPE_CHECKED_AT}>{date(PRODUCT_SCOPE_CHECKED_AT)}</time>):</p>
    <ul>{other.map(row => { const cell = vendor.cells[row.key]; return <li key={row.key}><strong>{row.label}</strong>{cell.product && <>: {cell.source ? <a href={cell.source} target="_blank" rel="noopener">{cell.product}</a> : cell.product}</>}{cell.status === "integration" && " (via integrations)"}</li>; })}</ul>
  </section>;
}
