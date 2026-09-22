import { RequestFlow } from "@/components/lab/request-flow";
export const metadata = { title: "Analyze your tool", description: "Suggest three customers; we research two more for a five-storefront evaluation of policy-compliant resolution, answer quality and speed. Validated results join the current research library and compatible comparisons.", alternates: { canonical: "/request" } };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const name = typeof params.provider === "string" ? params.provider.trim().slice(0, 100) : "";
  const website = typeof params.website === "string" ? params.website.trim().slice(0, 2048) : "";
  return <RequestFlow key={JSON.stringify([name, website])} initialProvider={{ name, website }} />;
}
