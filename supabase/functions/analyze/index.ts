// Supabase Edge Function "analyze"
// 브라우저 대신 서버에서 Anthropic API 를 호출 → API 키가 브라우저/다른 컴퓨터에 노출되지 않음.
// 필요한 Secret: ANTHROPIC_API_KEY  (대시보드 → Edge Functions → Secrets)
// 두 가지 요청:
//   { prompt }              → 보고서 AI 분석 (Haiku)
//   { ocr: true, files }    → 결과지 이미지·PDF 읽기 (표를 JSON 으로) — 작은 숫자를 정확히 읽도록 Opus
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 16000;   // 보고서 항목이 늘어도 잘리지 않게 (예전 4000에서 끝부분 잘림)
const OCR_MODEL = "claude-opus-5-5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const OCR_PROMPT = [
  "첨부한 것은 알레르기 검사 결과지(한 건)입니다. 여러 이미지는 같은 결과지를 위에서부터 잘라 이어 붙인 조각이라 경계에서 같은 줄이 두 번 보일 수 있습니다(번호 No 로 한 번만).",
  "결과지에 적힌 그대로 읽어서 아래 JSON 하나만 출력하세요. 설명이나 코드블록 표시 없이 JSON 만.",
  "{",
  "  \"chart_no\": \"차트번호(등록번호) 칸의 값. 의뢰번호·기관기호·검체번호가 아님. 없으면 빈 문자열\",",
  "  \"name\": \"수진자명(환자 이름). 없으면 빈 문자열\",",
  "  \"test_date\": \"검체채취일 YYYY-MM-DD (없으면 검사의뢰일, 그것도 없으면 빈 문자열)\",",
  "  \"panel\": \"MAST 또는 CAP 또는 기타 (검사명 기준)\",",
  "  \"total_ige\": \"Total IgE 수치 그대로 (예: 75.05, >2000). 없으면 빈 문자열\",",
  "  \"items\": [ { \"no\": 번호, \"name\": \"알레르겐 이름 원문 그대로 (영문(한글) 모두)\", \"value\": \"IU/mL 수치 원문 그대로 (예: 0.88, ≥100, <0.35)\", \"class\": 정수 0~6 또는 null } ],",
  "  \"unreadable\": [\"흐려서 확실하지 않은 항목 이름\"]",
  "}",
  "규칙:",
  "- Total IgE 를 제외한 모든 알레르겐 줄을 빠짐없이 넣으세요. Class 0 도 포함.",
  "- class 는 결과지의 Class 칸(숫자 또는 막대 그래프 칸 위치)을 읽은 값. Class 칸이 없거나 안 보이면 null.",
  "- 추측하지 마세요. 숫자가 확실하지 않으면 읽은 대로 넣고 그 항목 이름을 unreadable 에 넣으세요.",
].join("\n");

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

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

  const body = await req.json().catch(() => ({}));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Secret 붙여넣기 때 섞인 공백·줄바꿈·따옴표 제거
    "x-api-key": (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim().replace(/^["']|["']$/g, ""),
    "anthropic-version": "2023-06-01",
  };
  let payload: Record<string, unknown>;

  if (body.ocr) {
    const files = Array.isArray(body.files) ? body.files : [];
    let size = 0;
    const content: unknown[] = [];
    for (const f of files) {
      if (!f || !ALLOWED.includes(f.media_type) || typeof f.data !== "string") return json({ error: "잘못된 파일 형식" }, 400);
      size += f.data.length;
      content.push(f.media_type === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: f.media_type, data: f.data } }
        : { type: "image", source: { type: "base64", media_type: f.media_type, data: f.data } });
    }
    if (!content.length || content.length > 20 || size > 25000000) return json({ error: "이미지 개수·크기 초과" }, 400);
    content.push({ type: "text", text: OCR_PROMPT });
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    payload = {
      model: OCR_MODEL, max_tokens: 16000,
      output_config: { effort: "medium" },
      fallbacks: "default",   // 안전 필터가 거절하면 다른 모델로 자동 재시도
      messages: [{ role: "user", content }],
    };
  } else {
    const { prompt } = body;
    if (typeof prompt !== "string" || !prompt || prompt.length > 200000) return json({ error: "잘못된 요청" }, 400);
    payload = { model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: "user", content: prompt }] };
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(payload) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: data?.error?.message ?? "Anthropic HTTP " + r.status }, 502);
  if (data.stop_reason === "refusal") return json({ error: "AI가 이 요청을 처리하지 않았습니다 (다시 시도해 주세요)" }, 502);
  const text = (data.content ?? []).filter((b: { type?: string }) => b.type === "text").map((b: { text?: string }) => b.text ?? "").join("");
  return json({ text, stop_reason: data.stop_reason ?? null });
});
