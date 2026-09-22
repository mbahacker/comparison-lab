import { ApiError } from './model.ts';
import { getPolicyStudy, policyStudyArtifact } from './policy-studies.ts';
import { recordReportAccess } from './report-access.ts';
import { requireReportOrigin, requireUser, sessionUser, workEmailEligible } from './security.ts';

const headers = { 'cache-control': 'private, no-store', vary: 'Cookie', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const resources = ['evidence', 'html', 'bundle', 'method', 'validation'] as const;
type Resource = typeof resources[number];
const extensions: Record<Resource, string> = { evidence: 'json', html: 'html', bundle: 'zip', method: 'md', validation: 'json' };
const types: Record<Resource, string> = { evidence: 'application/json', html: 'text/html', bundle: 'application/zip', method: 'text/markdown', validation: 'application/json' };

export async function handlePolicyStudy(request: Request, slug: string, parts: string[] = []) {
  try {
    if (request.method !== 'GET' || parts.length > 1) throw new ApiError(404, 'Endpoint not found.');
    if (!parts.length) {
      const { summary } = getPolicyStudy(slug), user = sessionUser(request);
      return json({ study: summary, access: { verified: !!user && workEmailEligible(user.email) } });
    }
    const resource = parts[0];
    if (resource !== 'details' && !resources.includes(resource as Resource)) throw new ApiError(404, 'Endpoint not found.');
    const user = requireUser(request);
    if (!workEmailEligible(user.email)) throw new ApiError(403, 'Verify your work email to access the detailed study.');
    requireReportOrigin(request);
    const release = getPolicyStudy(slug);
    if (resource === 'details') {
      const evidence = JSON.parse(policyStudyArtifact(slug, 'evidence').bytes.toString('utf8')) as unknown;
      const downloads = resources.flatMap(key => {
        const artifact = release.manifest[key];
        return artifact ? [{ resource: key, filename: `${slug}-${key}.${extensions[key]}`, sha256: artifact.sha256 }] : [];
      });
      recordReportAccess(user, `study:${slug}`, release.summary, 'view', `/studies/${slug}`);
      return json({ study: release.summary, evidence, downloads });
    }
    const key = resource as Resource, { bytes } = policyStudyArtifact(slug, key);
    recordReportAccess(user, `study:${slug}`, release.summary, 'download', `/studies/${slug}`);
    return new Response(new Uint8Array(bytes), { headers: {
      ...headers, 'content-type': `${types[key]}${key === 'bundle' ? '' : '; charset=utf-8'}`,
      'content-disposition': `attachment; filename="${slug}-${key}.${extensions[key]}"`,
      // Downloaded static HTML must be self-contained. Network access and embedding are disabled.
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts",
    } });
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error('[Alhena Research Lab studies]', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'The study is unavailable. Please try again later.' }, 500);
  }
}
