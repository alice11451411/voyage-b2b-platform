import { DiscoveryError, searchPublicCompanies } from "../../../../lib/discovery.ts";
import type { SearchInput } from "../../../../lib/discovery-types.ts";

export async function POST(request: Request) {
  let input: SearchInput;
  try { input = await request.json(); } catch { return Response.json({ error: "搜索参数不是有效的 JSON。" }, { status: 400 }); }
  try { return Response.json(await searchPublicCompanies(input)); }
  catch (error) { return Response.json({ error: error instanceof DiscoveryError ? error.message : "搜索暂时失败，请稍后重试。" }, { status: error instanceof DiscoveryError ? error.status : 502 }); }
}
