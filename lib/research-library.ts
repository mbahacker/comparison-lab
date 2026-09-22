import type { PolicyLaneResult, PolicyStudySummary, StudyMetric } from './policy-study.ts';

/** Public summaries only. A provider's lanes always come from the same approved study. */
export type ResearchTool = {
  id: string; name: string; website: string; studySlug: string; studyTitle: string;
  protocol: 'policy-resolution-v1'; publishedAt: string; captureStartAt: string; captureEndAt: string;
  registeredStores: number; shopping: PolicyLaneResult; support: PolicyLaneResult; overallComposite: StudyMetric;
};

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const timestamp = (value: string) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('Invalid approved study date.');
  return time;
};
export function compareResearchStudies(a: PolicyStudySummary, b: PolicyStudySummary) {
  return timestamp(b.captureEndAt) - timestamp(a.captureEndAt)
    || timestamp(b.publishedAt) - timestamp(a.publishedAt) || compareText(a.slug, b.slug);
}
const metric = (value: StudyMetric): StudyMetric => ({ value: value.value, explanation: value.explanation });
function lane(value: PolicyLaneResult): PolicyLaneResult {
  const c = value.coverage;
  return {
    policyResolution: metric(value.policyResolution), quality: metric(value.quality),
    speed: metric(value.speed), composite: metric(value.composite), coverage: {
      plannedCheckpoints: c.plannedCheckpoints, attemptedCheckpoints: c.attemptedCheckpoints,
      observedCheckpoints: c.observedCheckpoints, submittedCheckpoints: c.submittedCheckpoints,
      assessedCheckpoints: c.assessedCheckpoints, unassessableCheckpoints: c.unassessableCheckpoints,
      attainedCheckpoints: c.attainedCheckpoints, policyUnverifiedCheckpoints: c.policyUnverifiedCheckpoints,
      includedContexts: c.includedContexts, excludedContexts: c.excludedContexts,
      includedStores: c.includedStores, excludedStores: c.excludedStores,
      qualityEligibleContexts: c.qualityEligibleContexts, qualityEligibleStores: c.qualityEligibleStores,
      originalCaptures: c.originalCaptures, repairedCaptures: c.repairedCaptures,
    },
  };
}

/** The server supplies approved summaries and its existing normalized toolId function. */
export function projectResearchTools(studies: readonly PolicyStudySummary[], identifyTool: (website: string) => string): ResearchTool[] {
  const selected = new Map<string, ResearchTool>();
  const compatible = studies.filter(study => study.protocol === 'policy-resolution-v1' && study.method.status === 'final');
  for (const study of [...compatible].sort(compareResearchStudies)) {
    const seen = new Set<string>();
    for (const provider of study.providers) {
      const id = identifyTool(provider.website);
      if (seen.has(id)) throw new Error('Duplicate normalized provider in approved study.');
      seen.add(id);
      if (selected.has(id)) continue;
      selected.set(id, {
        id, name: provider.name, website: provider.website, studySlug: study.slug, studyTitle: study.title,
        protocol: 'policy-resolution-v1', publishedAt: study.publishedAt,
        captureStartAt: study.captureStartAt, captureEndAt: study.captureEndAt,
        registeredStores: provider.registeredStores, shopping: lane(provider.shopping), support: lane(provider.support),
        overallComposite: metric(provider.overallComposite),
      });
    }
  }
  return [...selected.values()].sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
}

export function researchToolDescription(tool: ResearchTool): string {
  const display = (m: StudyMetric) => m.value === null ? 'not eligible' : `${m.value}/100`;
  return `${tool.name}: shopping composite ${display(tool.shopping.composite)}, support composite ${display(tool.support.composite)}, overall composite ${display(tool.overallComposite)}. Policy-compliant resolution, quality and speed across ${tool.registeredStores} registered storefronts; coverage and source study disclosed.`;
}

export function researchToolStructuredData(tool: ResearchTool, origin: string) {
  const url = (pathname: string) => new URL(pathname, origin).href;
  const variables = (['shopping', 'support'] as const).flatMap(mode => {
    const labels = { policyResolution: 'Policy-compliant resolution in public sessions', quality: 'Answer quality', speed: 'Full-answer speed score', composite: 'Composite' };
    return (Object.keys(labels) as (keyof typeof labels)[]).flatMap(key => {
      const value = tool[mode][key].value;
      return value === null ? [] : [{ '@type': 'PropertyValue', name: `${mode === 'shopping' ? 'Shopping' : 'Support'} ${labels[key]}`, value, unitText: 'points out of 100' }];
    });
  });
  if (tool.overallComposite.value !== null) variables.push({ '@type': 'PropertyValue', name: 'Overall composite', value: tool.overallComposite.value, unitText: 'points out of 100' });
  return {
    '@context': 'https://schema.org', '@type': 'Dataset', '@id': url(`/tools/${tool.id}#scores`),
    name: `${tool.name}: policy-resolution study results`, url: url(`/tools/${tool.id}`),
    description: researchToolDescription(tool), isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: 'Alhena Research Lab', url: url('/') },
    datePublished: tool.publishedAt, temporalCoverage: `${tool.captureStartAt}/${tool.captureEndAt}`,
    measurementTechnique: url('/studies/policy-resolution-v1'), citation: url(`/studies/${tool.studySlug}`),
    variableMeasured: variables,
    distribution: { '@type': 'DataDownload', contentUrl: url('/tool-scores.json'), encodingFormat: 'application/json', name: 'Latest approved study score summaries' },
  };
}
