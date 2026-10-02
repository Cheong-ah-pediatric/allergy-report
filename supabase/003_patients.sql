-- 환자 이름(암호화) + 앱 설정 표 — SQL Editor 새 탭에 붙여넣고 Run (002 실행 후 1회)
-- 이름은 브라우저에서 병원 비밀문구로 암호화한 값(name_enc)만 저장됨. 서버/DB 에는 평문 이름이 없음.

create table if not exists public.patients (
  chart_no    text primary key,              -- 등록번호
  name_enc    text,                          -- 암호화된 이름 (AES-GCM, "iv:ciphertext")
  updated_at  timestamptz not null default now()
);
drop trigger if exists patients_touch on public.patients;
create trigger patients_touch before update on public.patients
  for each row execute function public.touch_updated_at();
alter table public.patients enable row level security;
drop policy if exists staff_all on public.patients;
create policy staff_all on public.patients
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 비밀문구 확인용 값 등 (값도 암호문)
create table if not exists public.app_settings (
  key    text primary key,
  value  text
);
alter table public.app_settings enable row level security;
drop policy if exists staff_all on public.app_settings;
create policy staff_all on public.app_settings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
