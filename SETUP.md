# 클라우드(Supabase) 설정 안내

환자 검사 기록을 클라우드에 저장해 **이전 검사와 비교**하고, **다른 컴퓨터에서도 같은 기록**을 쓰기 위한 1회성 설정입니다. (약 15분)

설정 전에도 사이트는 지금처럼 동작합니다(로컬 API 키 사용, 저장·비교 없음).

---

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 가입 → **New project**
2. Region: **Northeast Asia (Seoul)** 선택, DB 비밀번호는 안전한 곳에 보관

## 2. 데이터베이스 만들기
1. 왼쪽 **SQL Editor** → New query
2. `supabase/schema.sql` 내용을 전부 붙여넣기
3. 맨 아래 `CHANGE_ME@example.com` 을 **병원 로그인용 이메일**로 바꾸기
4. **Run**

## 3. 로그인 계정 만들기 (중요: 외부인 가입 차단)
1. **Authentication → Sign In / Providers → Email**: `Allow new users to sign up` **끄기**
2. **Authentication → Users → Add user → Create new user**
   - 2번에서 넣은 이메일 + 비밀번호, `Auto Confirm User` 체크
3. 직원을 추가하려면: 같은 방법으로 사용자 추가 + SQL Editor에서
   `insert into public.staff (email) values ('새이메일');`
   퇴사 시: `delete from public.staff where email = '...';` 후 사용자도 삭제

## 4. AI 분석 서버 함수 (API 키를 서버에 보관)
1. **Edge Functions → Deploy a new function → Via Editor**
2. 함수 이름: `analyze`
3. `supabase/functions/analyze/index.ts` 내용을 붙여넣고 **Deploy**
4. **Edge Functions → Secrets** → `ANTHROPIC_API_KEY` = Anthropic API 키 → Save

## 5. 사이트에 연결
1. **Project Settings → API** (또는 Data API / API Keys)에서
   - `Project URL`
   - `anon` `public` 키
2. `index.html` 상단의 두 줄에 붙여넣기
   ```js
   const SUPABASE_URL      = "https://xxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJ...";
   ```
   > anon 키는 공개돼도 되는 키입니다. 데이터는 로그인 + staff 목록으로 보호됩니다.
   > **service_role 키는 절대 넣지 마세요.**
3. GitHub에 푸시 → 1~2분 뒤 사이트 반영

## 6. 사용
- 각 컴퓨터에서 사이트 접속 → 왼쪽 위 **로그인** 1회 (이후 자동 유지)
- 등록번호 입력 → 이전 검사 목록 표시 → 결과 붙여넣고 **보고서 생성**
  - 자동 저장 + 이전 검사가 있으면 "이전 검사 대비 변화" 표와 AI 6번 항목 추가
  - 같은 등록번호·검사일·패널로 다시 생성하면 덮어씀
- 목록의 **불러오기**: 과거 보고서를 그대로 다시 열어 재인쇄 (저장된 AI 결과 사용)

---

## 개인정보 관련
- 클라우드에는 **등록번호 + 검사 결과만** 저장, **이름은 저장하지 않음** (인쇄 시에만 입력)
- AI에는 이름·등록번호를 보내지 않음
- GitHub 레포는 공개 상태이므로 **환자 데이터나 비밀 키를 레포에 올리지 말 것**
- 무료 플랜은 **7일간 사용이 없으면 프로젝트가 일시정지**됩니다(데이터는 유지). 긴 휴가 후엔 대시보드에서 Restore.
- 무료 플랜은 자동 백업이 제한적 → 가끔 **Table Editor → allergy_tests → Export CSV** 로 백업 권장
