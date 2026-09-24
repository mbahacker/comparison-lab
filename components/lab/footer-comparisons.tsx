import Link from 'next/link';
import { getResearchLibrary } from '@/lib/server/research-library';
import { listReports } from '@/lib/server/evidence';

const displayName = (name: string) => name === 'Alhena' ? 'Alhena AI' : name === 'Sierra' ? 'Sierra AI' : name;
const comparisonName = (names: string[]) => names.map(displayName).sort((a, b) => a.localeCompare(b)).join(' vs ');

/** Read published catalogs at request time so newly published comparisons appear without a deploy. */
export function FooterComparisons() {
  const studies = getResearchLibrary().studies.filter(study => study.providers.length > 1);
  const pilots = listReports().filter(report => report.vendors.length > 1);
  if (!studies.length && !pilots.length) return null;
  return <nav className="footer-comparisons" aria-labelledby="footer-comparisons-title">
    <h2 id="footer-comparisons-title">Comparisons</h2>
    <ul>
      {studies.map(study => <li key={`study:${study.slug}`}>
        <Link href={`/studies/${study.slug}`} title={`${study.title} · Published ${study.publishedAt.slice(0, 10)}`}>
          {comparisonName(study.providers.map(provider => provider.name))}
        </Link>
      </li>)}
      {pilots.map(report => <li key={`pilot:${report.slug}`}>
        <Link href={`/reports/${report.slug}`}>
          {comparisonName(report.vendors)} <span className="footer-comparison-note">(historical quality pilot)</span>
        </Link>
      </li>)}
    </ul>
  </nav>;
}
