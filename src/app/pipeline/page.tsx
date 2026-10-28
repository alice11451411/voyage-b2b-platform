// Browser-local project data is available after hydration; no instant server-prefetched UI.
export const instant = false;
import { Pipeline } from "@/components/pipeline";
export default function Page() { return <Pipeline />; }
