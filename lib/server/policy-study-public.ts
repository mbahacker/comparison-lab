import type { PolicyStudySummary } from '../policy-study.ts';
import { POLICY_LABEL } from '../policy-study.ts';
import { publicUrl, publisher } from './public-data.ts';

export function policyStudyStructuredData(study: PolicyStudySummary) {
  return {
    '@context': 'https://schema.org', '@type': 'Report', name: study.title,
    description: study.description, url: publicUrl(`/studies/${study.slug}`),
    datePublished: study.publishedAt, temporalCoverage: `${study.captureStartAt}/${study.captureEndAt}`,
    publisher: publisher(), author: publisher(),
    about: [POLICY_LABEL, 'Shopping and support quality', 'Full-answer speed', 'Policy-resolution composite'],
    isAccessibleForFree: false,
    hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.study-protected-evidence' },
    measurementTechnique: `${study.protocol}; method SHA-256 ${study.method.sha256}`,
  };
}
export function publicPolicyStudyData(studies: PolicyStudySummary[]) {
  return { schema: 'alhena-research-lab/policy-study-catalog-v1', publisher: 'Alhena Research Lab',
    description: 'Approved, separately versioned public-session studies. PCR, quality, speed and composite are distinct measures. Detailed evidence requires verified work email.',
    studies: studies.map(study => ({ ...study, url: publicUrl(`/studies/${study.slug}`), methodology: publicUrl('/studies/policy-resolution-v1') })),
  };
}
