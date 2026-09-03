// ============================================================
// 서비스 워커 등록
// index.html, ledger.html 둘 다 이 파일을 불러옵니다.
// ============================================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("service-worker.js")
      .catch((err) => console.warn("서비스 워커 등록 실패:", err));
  });
}
