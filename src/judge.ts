import type { Judgment } from "./game";
export async function judge(
  from: string,
  to: string,
  code: string,
  explanation?: string,
): Promise<Judgment & { recommendation?: "safe" | "out" | "unknown" }> {
  try {
    const r = await fetch("/api/judge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(code ? { Authorization: `Bearer ${code}` } : {}),
      },
      body: JSON.stringify({ from, to, explanation }),
      signal: AbortSignal.timeout(18000),
    });
    const data = await r.json();
    if (
      !["safe", "explain", "unknown"].includes(data.verdict) ||
      typeof data.comment !== "string"
    )
      throw new Error();
    return data;
  } catch {
    return {
      verdict: "unknown",
      comment: "AI審判に接続できません。みんなで判定しよう！",
      source: "unavailable",
      recommendation: "unknown",
    };
  }
}
