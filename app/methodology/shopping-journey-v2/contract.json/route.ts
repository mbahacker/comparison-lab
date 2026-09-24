import { SHOPPING_PROTOCOL, SHOPPING_PROTOCOL_HASH } from '@/benchmark/shopping-journey.mjs';

export function GET() {
  return Response.json({
    schema: 'alhena-research-lab/shopping-framework-v2',
    protocol: SHOPPING_PROTOCOL,
    protocolHash: SHOPPING_PROTOCOL_HASH,
    status: 'framework-only-no-results',
    automatedCaptureEnabled: false,
    publicationEnabled: false,
    description: 'Versioned methodology contract, not evaluation results. Existing submissions and scores retain policy-resolution-v1. Support scoring is unchanged.',
  }, { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Content-Type-Options': 'nosniff' } });
}
