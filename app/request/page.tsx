import { RequestFlow } from "@/components/lab/request-flow";
export const metadata = { title: "Analyze your tool" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const name = typeof params.provider === "string" ? params.provider.trim().slice(0, 100) : "";
  const website = typeof params.website === "string" ? params.website.trim().slice(0, 2048) : "";
  return <RequestFlow key={JSON.stringify([name, website])} initialProvider={{ name, website }} />;
}
