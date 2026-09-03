#용돈기입장

로그인/회원가입 없이 가족끼리만 쓰는 용돈기입장 웹사이트입니다.
처음 화면에서 1~4번 버튼(세로로 나열됨)을 누르면 각자의 기록 페이지(`ledger.html`)로 실제 이동합니다.
기록 페이지에서는 항상 [이전전달 · 이전달 · 이번달 · 다음달] 4개월치를 볼 수 있습니다.
**수정은 실제 오늘 날짜 기준 "이번달" 탭에서만 가능하고, 나머지 달은 보기 전용입니다.**

## 폴더 구조

```
allowance-tracker/
├── index.html              ← 처음 화면 (1~4번 버튼이 세로로 나열됨)
├── ledger.html             ← 실제 기입장 화면 (index.html에서 이동해오는 페이지)
├── manifest.webmanifest    ← PWA 설정 (앱 이름, 아이콘, 테마 색 등)
├── service-worker.js       ← PWA 오프라인/캐시 담당
├── icons/                  ← 홈 화면 아이콘 이미지들
├── css/style.css            ← 디자인 (색상 등은 :root 변수만 바꾸면 됩니다)
├── js/users.js              ← 1~4번 이름 (index.html, ledger.html이 공용으로 사용)
├── js/config.js             ← Supabase 접속 정보 (여기 2줄만 채우면 됨)
├── js/app.js                ← ledger.html의 전체 로직 (설정값은 파일 맨 위에 모아둠)
├── js/register-sw.js        ← 서비스 워커를 등록하는 공용 스크립트
└── supabase/schema.sql      ← Supabase에 실행할 테이블 생성 SQL
```

## 동작 방식

1. `index.html`을 열면 1~4번 버튼이 세로로 나열되어 있습니다.
2. 버튼을 누르면 `ledger.html?user=1` 처럼 **실제로 다른 페이지로 이동**합니다. (같은 파일을 재사용하되, 주소창의 `user` 번호로 몇 번 기입장인지 구분합니다 — 4개 파일을 따로 관리하지 않아도 되어 유지보수가 쉽습니다)
3. `ledger.html`은 주소의 번호를 읽어 그 사람의 기록만 보여주고, 상단의 **← 처음으로** 링크를 누르면 다시 `index.html`로 돌아갑니다.
4. `ledger.html`을 주소 없이(`user` 파라미터 없이) 직접 열면 자동으로 `index.html`로 돌려보냅니다.

## 1. Supabase 준비하기

1. [supabase.com](https://supabase.com) 에서 무료 프로젝트를 하나 만듭니다.
2. 왼쪽 메뉴 **SQL Editor** → **New query** 로 들어가서 `supabase/schema.sql` 파일의 내용을 통째로 붙여넣고 **Run** 을 누릅니다. (`transactions` 테이블이 생성됩니다)
3. 왼쪽 메뉴 **Project Settings → API** 로 들어가서
   - **Project URL**
   - **anon public** 키

   두 값을 복사합니다.

## 2. VS Code에서 접속 정보 입력

`js/config.js` 파일을 열고 두 값만 채워주세요.

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

## 3. 실행하기

빌드 과정이 필요 없는 순수 HTML/CSS/JS 사이트입니다. 아래 방법 중 하나로 열면 됩니다.

- **VS Code 확장 `Live Server`** 설치 후, `index.html`에서 마우스 오른쪽 클릭 → `Open with Live Server`
- 또는 아무 정적 사이트 호스팅(예: Vercel, Netlify, GitHub Pages)에 이 폴더를 그대로 올리기

> ⚠️ `index.html`을 더블클릭해서 `file://`로 직접 여는 방식은 브라우저 보안 정책 때문에 정상 동작하지 않을 수 있습니다. 꼭 Live Server 같은 방식으로 열어주세요.

## 4. 자주 바꾸게 될 부분

| 바꾸고 싶은 것 | 위치 |
|---|---|
| 1~4번 이름 (예: "1번" → "첫째") | `js/users.js` 의 `USERS` 배열 `name` |
| 지출 항목 종류 | `js/app.js` 맨 위 `BASE_EXPENSE_CATEGORIES` |
| 특정 번호에게만 보이는 항목 (예: 2번의 "야구 직관") | `js/app.js` 맨 위 `SPECIAL_CATEGORIES` |
| 결제 수단 종류 | `js/app.js` 맨 위 `PAYMENT_METHODS` |

색상은 `css/style.css` 맨 위 `:root { ... }` 안의 변수만 바꾸면 전체 디자인에 반영됩니다.

## 참고 사항

- **월 이동은 자동입니다.** 오늘 날짜를 기준으로 매번 [이전전달·이전달·이번달·다음달]을 다시 계산하기 때문에, 다음 달이 되면 자동으로 화면에 보이는 4개월 범위가 한 칸씩 밀려납니다. (지난 기록은 삭제되지 않고 데이터베이스에 그대로 남아있습니다 — 필요하면 나중에 다시 조회할 수 있도록 일부러 삭제하지 않았습니다.)
- **로그인이 없는 사이트**이므로, 이 사이트의 배포 주소(URL)를 가족 외의 사람에게 공유하지 않는 것을 권장합니다. (`schema.sql`에 관련 주의사항이 주석으로 적혀 있습니다)
- 금액 입력칸은 숫자만 입력되도록 자동으로 걸러지고, 입력한 값 옆에 "원"이 자동으로 붙습니다.

## 5. 앱처럼 설치하기 (PWA)

이 사이트는 PWA(Progressive Web App)로 만들어져 있어서, **HTTPS로 배포된 주소**(GitHub Pages, Vercel, Netlify 등 — `file://`나 `http://`가 아닌 실제 배포 주소)로 접속하면 휴대폰/PC에 앱처럼 설치할 수 있습니다.

- **안드로이드(크롬)**: 사이트 접속 → 브라우저 메뉴(⋮)에서 "홈 화면에 추가" 또는 "앱 설치" 선택
- **아이폰(사파리)**: 사이트 접속 → 공유 버튼(⬆️) → "홈 화면에 추가"
- **PC(크롬/엣지)**: 주소창 오른쪽의 설치 아이콘 클릭

설치하면 홈 화면에 아이콘이 생기고, 브라우저 주소창 없이 앱처럼 열립니다. 인터넷이 잠깐 끊겨도 화면 자체는 바로 뜨지만(캐시된 화면), 실제 기록을 불러오거나 저장하려면 인터넷 연결이 필요합니다 — Supabase 데이터는 오프라인 상태에서 저장/조회되지 않도록 일부러 캐시하지 않았습니다.

> ⚠️ 화면 파일(html/css/js)을 수정한 뒤 배포했는데 예전 화면이 계속 보인다면, `service-worker.js` 맨 위의 `CACHE_VERSION`을 `"v1"` → `"v2"`처럼 올려서 다시 배포해주세요. 그래야 사용자 기기에 남아있던 캐시가 새로 갱신됩니다.

