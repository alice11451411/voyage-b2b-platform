// Browser-local project data is available after hydration; no instant server-prefetched UI.
export const instant = false;
import { Dashboard } from "@/components/dashboard";
export default function Page() { return <Dashboard />; }
