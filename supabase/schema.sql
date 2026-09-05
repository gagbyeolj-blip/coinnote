-- ============================================================
-- 용돈기입장 데이터베이스 스키마
-- 사용법: Supabase 프로젝트 > 왼쪽 메뉴 [SQL Editor] > New query
--        에 이 파일 내용을 통째로 붙여넣고 [Run] 버튼을 누르세요.
-- ============================================================

create table if not exists transactions (
  id            bigint generated always as identity primary key,

  -- 1~4번 중 누구의 기록인지 (index.html 상단 버튼과 매칭됩니다)
  user_no       smallint not null check (user_no between 1 and 4),

  -- 실제 거래가 발생한 날짜 (기록을 입력한 날짜가 아니어도 됨)
  entry_date    date not null,

  -- 수입 / 지출 구분
  type          text not null check (type in ('income', 'expense')),

  -- 항목: 간식, 쇼핑, 준비물, 교통비, 기타, 책 구입, 야구 직관(2번 전용), 수입
  -- 종류를 더 추가/변경하고 싶다면 js/app.js 의 CATEGORIES 부분을 함께 수정하세요.
  category      text not null,

  -- 금액 (원 단위, 정수만 허용)
  amount        numeric(12, 0) not null check (amount > 0),

  -- 결제 수단: 현금 / 카드 / 계좌이체 / 기타
  payment_method text not null check (payment_method in ('현금', '카드', '계좌이체', '기타')),

  -- 메모 (선택 입력)
  memo          text,

  created_at    timestamptz not null default now()
);

-- 사용자 번호 + 날짜로 조회하는 경우가 대부분이라 인덱스를 걸어둡니다.
create index if not exists idx_transactions_user_date
  on transactions (user_no, entry_date);

-- ------------------------------------------------------------
-- 로그인 없이 가족끼리만 쓰는 사이트라서 RLS(행 단위 보안 정책)를 끕니다.
-- ⚠️ 주의: 이 상태에서는 anon key만 있으면 누구나 데이터를 읽고 쓸 수 있어요.
--          배포한 사이트 주소(URL)를 가족 외의 사람에게 공유하지 마세요.
-- ------------------------------------------------------------
alter table transactions disable row level security;

-- ------------------------------------------------------------
-- 오래된 기록 자동 삭제 (선택 사항)
-- 화면에는 [이전전달·이전달·이번달·다음달] 4개월치만 보여주는데,
-- 그 범위보다 오래된 기록은 DB에서도 매일 자정에 자동으로 삭제되도록
-- pg_cron으로 예약해뒀습니다. (한 번 지워지면 복구할 수 없습니다)
--
-- 끄고 싶다면 아래 한 줄만 실행하면 됩니다:
--   select cron.unschedule('cleanup-old-transactions');
-- ------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-old-transactions',
  '0 0 * * *', -- 매일 자정
  $$ delete from transactions where entry_date < (date_trunc('month', current_date) - interval '2 months') $$
);

