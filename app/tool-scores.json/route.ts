import { getToolLibrary } from '@/lib/server/reuse';
import { publicToolData } from '@/lib/server/public-data';
export const dynamic='force-dynamic';
export async function GET(){const library=getToolLibrary();return Response.json(publicToolData(library.tools,library.generatedAt),{headers:{'Cache-Control':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff'}});}
