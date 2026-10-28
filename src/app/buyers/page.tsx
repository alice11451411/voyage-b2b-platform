// Browser-local project data is available after hydration; no instant server-prefetched UI.
export const instant = false;
import { BuyerList } from "@/components/buyer-list";
export default function Page() { return <BuyerList />; }
