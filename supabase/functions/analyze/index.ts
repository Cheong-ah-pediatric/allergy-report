// Supabase Edge Function "analyze"
// 브라우저 대신 서버에서 Anthropic API 를 호출 → API 키가 브라우저/다른 컴퓨터에 노출되지 않음.
// 필요한 Secret: ANTHROPIC_API_KEY  (대시보드 → Edge Functions → Secrets)
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // 로그인한 직원(staff 목록)만 허용
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: ok, error: staffErr } = await sb.rpc("is_staff");
  if (staffErr || !ok) return json({ error: "권한 없음 (staff 목록에 없는 계정)" }, 403);

  const { prompt } = await req.json().catch(() => ({}));
  if (typeof prompt !== "string" || !prompt || prompt.length > 30000) return json({ error: "잘못된 요청" }, 400);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: data?.error?.message ?? `Anthropic HTTP ${r.status}` }, 502);
  const text = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
  return json({ text });
});
