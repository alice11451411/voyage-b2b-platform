import { DiscoveryError, verifyWebsite } from "../../../../lib/discovery.ts";

export async function POST(request: Request) {
  let input: { url: string };
  try { input = await request.json(); } catch { return Response.json({ error: "官网参数不是有效的 JSON。" }, { status: 400 }); }
  try { return Response.json(await verifyWebsite(input?.url)); }
  catch (error) { return Response.json({ error: error instanceof DiscoveryError ? error.message : "官网核验暂时失败，请人工打开核验。" }, { status: error instanceof DiscoveryError ? error.status : 502 }); }
}
