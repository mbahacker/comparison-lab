import { handlePolicyStudy } from '@/lib/server/policy-study-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; resource?: string[] }> }) {
  const { slug, resource } = await params;
  return handlePolicyStudy(request, slug, resource);
}
