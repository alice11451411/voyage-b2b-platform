export async function requestAI<T>(payload: object, fallback: () => T, online = false): Promise<{ data: T; source: "local" | "live" | "fallback"; message?: string }> {
  if (!online) return { data: fallback(), source: "local" };
  try {
    const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("AI unavailable");
    const result = await response.json();
    if (!result.data || !["live", "fallback"].includes(result.source)) throw new Error("Invalid AI response");
    return result;
  } catch { return { data: fallback(), source: "fallback", message: "在线生成未完成，已使用本地建议。你的原有内容不会因此丢失。" }; }
}
