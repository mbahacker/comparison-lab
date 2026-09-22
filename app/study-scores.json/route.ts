import { listPolicyStudies } from '@/lib/server/policy-studies';
import { publicPolicyStudyData } from '@/lib/server/policy-study-public';
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(publicPolicyStudyData(listPolicyStudies()), { headers: { 'cache-control': 'public, max-age=0, must-revalidate', 'x-content-type-options': 'nosniff' } });
}
