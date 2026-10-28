// Browser-local project data is available after hydration; no instant server-prefetched UI.
export const instant = false;
import { ProjectSettings } from "@/components/project-settings";
export default function Page() { return <ProjectSettings />; }
