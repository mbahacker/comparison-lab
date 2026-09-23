import type { PolicyStudySummary } from '../policy-study.ts';
import { POLICY_LABEL } from '../policy-study.ts';
import { breadcrumbData, publicUrl, publisher } from './public-data.ts';
import { studyFindings, studyHeadline, studyShortName } from '../study-findings.ts';
import { fullAnswerSeconds } from '../score-parts.ts';
import { CAPABILITIES, vendorScope } from '../product-scope.ts';

const MEASURES = [['composite', 'composite'], ['policyResolution', 'policy-compliant resolution'], ['quality', 'answer quality'], ['speed', 'full-answer speed score']] as const;

/** Report plus Dataset: the scores are published data, and the conversation evidence is the gated part. */
export function policyStudyStructuredData(study: PolicyStudySummary) {
  const url = publicUrl(`/studies/${study.slug}`);
  const variables = study.providers.flatMap(provider => [
    ...(['shopping', 'support'] as const).flatMap(lane => [
      ...MEASURES.flatMap(([key, label]) => provider[lane][key].value === null ? [] : [{ '@type': 'PropertyValue', name: `${provider.name} ${lane} ${label}`, value: provider[lane][key].value, unitText: 'points out of 100', description: provider[lane][key].explanation }]),
      ...(fullAnswerSeconds(provider[lane]) === null ? [] : [{ '@type': 'PropertyValue', name: `${provider.name} ${lane} average time to a full answer`, value: fullAnswerSeconds(provider[lane]), unitCode: 'SEC', unitText: 'seconds' }]),
    ]),
    ...(provider.overallComposite.value === null ? [] : [{ '@type': 'PropertyValue', name: `${provider.name} overall composite`, value: provider.overallComposite.value, unitText: 'points out of 100' }]),
  ]);
  return {
    '@context': 'https://schema.org', '@graph': [{
      '@type': ['Report', 'Dataset'], '@id': `${url}#study`, name: studyHeadline(study), headline: studyHeadline(study), alternateName: study.title,
      description: study.description, abstract: studyFindings(study).join(' '), url, mainEntityOfPage: url,
      datePublished: study.publishedAt, dateModified: study.publishedAt, temporalCoverage: `${study.captureStartAt}/${study.captureEndAt}`,
      publisher: publisher(), author: publisher(), creator: publisher(), inLanguage: 'en',
      about: [...study.providers.map(p => { const scope = vendorScope(p.website); return { '@type': 'SoftwareApplication', name: p.name, url: p.website, applicationCategory: 'Ecommerce AI shopping and support agent', ...(scope ? { featureList: CAPABILITIES.filter(row => scope.cells[row.key] && scope.cells[row.key].status !== 'not-listed').map(row => row.label) } : {}) }; }), POLICY_LABEL, 'Answer quality', 'Full-answer speed'],
      keywords: ['ecommerce AI agent evaluation', 'AI shopping assistant benchmark', 'AI customer support benchmark', ...study.providers.map(p => p.name)],
      variableMeasured: variables,
      measurementTechnique: `${study.protocol}; method SHA-256 ${study.method.sha256}`,
      citation: publicUrl('/studies/policy-resolution-v1'),
      isBasedOn: publicUrl('/study-scores.json'),
      distribution: { '@type': 'DataDownload', contentUrl: publicUrl('/study-scores.json'), encodingFormat: 'application/json', name: 'Public study summaries' },
      isAccessibleForFree: false,
      hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.study-protected-evidence' },
    }, breadcrumbData([{ name: 'Alhena Research Lab', path: '/' }, { name: 'Studies', path: '/studies' }, { name: studyShortName(study), path: `/studies/${study.slug}` }])],
  };
}
export function publicPolicyStudyData(studies: PolicyStudySummary[]) {
  return { schema: 'alhena-research-lab/policy-study-catalog-v1', publisher: 'Alhena Research Lab',
    description: 'Approved, separately versioned public-session studies. PCR, quality, speed and composite are distinct measures. Detailed evidence requires verified work email.',
    studies: studies.map(study => ({ ...study, url: publicUrl(`/studies/${study.slug}`), methodology: publicUrl('/studies/policy-resolution-v1') })),
  };
}
