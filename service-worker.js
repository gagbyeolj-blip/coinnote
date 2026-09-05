// ============================================================
// 서비스 워커 (PWA용)
//
// 하는 일 2가지만 기억하면 됩니다.
// 1) 화면을 구성하는 파일(html/css/js/아이콘)은 캐시해둬서
//    인터넷이 잠깐 끊겨도 앱이 하얀 화면 없이 바로 뜨게 합니다.
// 2) Supabase로 보내는 실제 데이터 요청(추가/수정/삭제/조회)은
//    절대 캐시하지 않고 항상 네트워크로 직접 보냅니다.
//    (여기까지 캐시해버리면 오래된 잔액이 보이거나, 오프라인인데
//     저장된 것처럼 착각하게 되는 위험한 상황이 생길 수 있어서예요)
//
// 화면 파일 목록을 수정(예: 새 페이지 추가)했다면 아래 APP_SHELL_FILES 에도
// 추가해주시고, 배포할 때마다 CACHE_NAME의 버전 숫자를 1씩 올려주세요.
// (버전을 안 올리면 사용자 브라우저에 예전 캐시가 계속 남아있을 수 있어요)
// ============================================================

const CACHE_VERSION = "v4";
const CACHE_NAME = `allowance-tracker-${CACHE_VERSION}`;

const APP_SHELL_FILES = [
  "index.html",
  "ledger.html",
  "css/style.css",
  "js/users.js",
  "js/config.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

// 설치 시점: 화면 파일들을 미리 내려받아 캐시에 저장
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

// 활성화 시점: 이전 버전 캐시는 정리
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GET 요청이 아니면(POST/PATCH/DELETE 등 = Supabase에 데이터 쓰는 요청) 그대로 네트워크로
  if (req.method !== "GET") return;

  // Supabase로 가는 요청(데이터 조회 포함)은 절대 캐시하지 않고 항상 네트워크로
  if (req.url.includes("supabase.co")) return;

  // 그 외(화면 파일들)는 "캐시에 있으면 우선 보여주고, 뒤에서 최신 버전으로 갱신" 전략
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached); // 네트워크도 안 되고 캐시도 없으면 실패

      return cached || networkFetch;
    })
  );
});
