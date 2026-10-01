-- 청아소아청소년과 알레르기 보고서 — Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 Run.
-- 마지막 줄의 이메일을 병원 계정 이메일로 바꾼 뒤 실행할 것.

-- 1) 접근 허용 직원 목록 (여기 있는 이메일로 로그인한 사람만 데이터 접근)
create table if not exists public.staff (
  email text primary key
);
alter table public.staff enable row level security;   -- 정책 없음 = 브라우저에서 읽기/쓰기 불가

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where email = (auth.jwt() ->> 'email'));
$$;

-- 2) 검사 기록 (이름은 저장하지 않음 — 등록번호만)
create table if not exists public.allergy_tests (
  id          uuid primary key default gen_random_uuid(),
  chart_no    text not null,                 -- 등록번호
  test_date   date not null,
  panel       text not null default 'MAST120',
  total_ige   text,                          -- '>2000' 같은 표기 허용
  results     jsonb not null,                -- [{name, canon, cls}]
  raw_input   text,
  ai_html     text,                          -- AI 분석 결과 (재인쇄용)
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (chart_no, test_date, panel)
);
create index if not exists allergy_tests_chart_idx on public.allergy_tests (chart_no, test_date desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists allergy_tests_touch on public.allergy_tests;
create trigger allergy_tests_touch before update on public.allergy_tests
  for each row execute function public.touch_updated_at();

alter table public.allergy_tests enable row level security;
drop policy if exists staff_all on public.allergy_tests;
create policy staff_all on public.allergy_tests
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 3) 직원 이메일 등록 (병원 계정 이메일로 바꾸세요. 여러 명이면 줄 추가)
insert into public.staff (email) values ('CHANGE_ME@example.com') on conflict do nothing;
