-- 면역치료(설하면역치료) 기록 표 — SQL Editor 에 붙여넣고 Run (schema.sql 실행 후 1회)
-- 한 환자가 약을 바꾸면 행이 여러 개: 이전 약은 end_date/end_reason 이 채워지고 새 약 행이 추가됨

create table if not exists public.immunotherapy_courses (
  id          uuid primary key default gen_random_uuid(),
  chart_no    text not null,                 -- 등록번호
  drug        text not null,                 -- 스타로랄 / 액트에어 / 라이스정 / 기타
  start_date  date not null,
  end_date    date,                          -- null = 진행 중
  end_reason  text,                          -- 효과 부족 → 변경 / 부작용 / 복용 불편·순응도 / 치료 완료 / 기타
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists immunotherapy_chart_idx on public.immunotherapy_courses (chart_no, start_date desc);

drop trigger if exists immunotherapy_touch on public.immunotherapy_courses;
create trigger immunotherapy_touch before update on public.immunotherapy_courses
  for each row execute function public.touch_updated_at();

alter table public.immunotherapy_courses enable row level security;
drop policy if exists staff_all on public.immunotherapy_courses;
create policy staff_all on public.immunotherapy_courses
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());
