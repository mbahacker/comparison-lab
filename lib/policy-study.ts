/** Public summaries deliberately contain no conversations, reader data or private file paths. */
export const POLICY_PROTOCOL = 'policy-resolution-v1' as const;
export const POLICY_LABEL = 'Policy-compliant resolution · public-session scope';
export type PolicyLane = 'shopping' | 'support';
export type StudyMetric = { value: number | null; explanation: string };
export type PolicyLaneResult = {
  policyResolution: StudyMetric;
  quality: StudyMetric;
  speed: StudyMetric;
  composite: StudyMetric;
  coverage: {
    plannedCheckpoints: number; attemptedCheckpoints: number; observedCheckpoints: number;
    submittedCheckpoints: number; assessedCheckpoints: number; unassessableCheckpoints: number;
    attainedCheckpoints: number; policyUnverifiedCheckpoints: number;
    includedContexts: number; excludedContexts: number; includedStores: number; excludedStores: number;
    qualityEligibleContexts: number; qualityEligibleStores: number;
    originalCaptures: number; repairedCaptures: number;
  };
};
export type PolicyStudySummary = {
  schema: 'alhena-research-lab/policy-study-summary-v1';
  protocol: typeof POLICY_PROTOCOL;
  slug: string; title: string; description: string; publishedAt: string;
  captureStartAt: string; captureEndAt: string;
  commissionedBy: 'Alhena Research Lab';
  method: { status: 'final'; sha256: string; sourceCommit: string; differences: string[] };
  sample: { plannedCoreContexts: number; capturedCoreContexts: number; guardrailContexts: number; judgedCoreContexts: number; pcrDecisions: number; auditedPcrDecisions: number };
  providers: {
    id: string; name: string; website: string; registeredStores: number;
    shopping: PolicyLaneResult; support: PolicyLaneResult;
    overallComposite: StudyMetric;
  }[];
  limitations: string[];
  audit: { description: string; limitations: string[] };
};
export type PolicyStudyDetails = {
  study: PolicyStudySummary;
  evidence: unknown;
  downloads: { resource: 'evidence' | 'html' | 'bundle' | 'method' | 'validation'; filename: string; sha256: string }[];
};
