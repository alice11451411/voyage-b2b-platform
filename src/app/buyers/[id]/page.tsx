// Browser-local project data is available after hydration; no instant server-prefetched UI.
export const instant = false;
import { BuyerDetail } from "@/components/buyer-detail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <BuyerDetail id={id} />; }
