import { compareResearchStudies, projectResearchTools } from '../research-library.ts';
import { listPolicyStudies } from './policy-studies.ts';
import { toolId } from './reuse.ts';

/** Catalog validation and artifact pin checks remain owned by the approved-study reader. */
export function getResearchLibrary(now = Date.now()) {
  const studies = listPolicyStudies().sort(compareResearchStudies);
  return { tools: projectResearchTools(studies, toolId), studies, generatedAt: new Date(now).toISOString() };
}
