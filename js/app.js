// ============================================================
// 용돈기입장 - 메인 로직
//
// 이 파일에서 자주 손댈 만한 부분은 맨 위 "설정" 구역에 모아뒀습니다.
// 로직을 바꿀 필요 없이 설정 값만 바꿔도 되는 것들은 최대한 여기로 뺐어요.
// ============================================================


// ------------------------------------------------------------
// 1. 설정 (자유롭게 수정 가능)
// ------------------------------------------------------------
// 1~4번 이름은 js/users.js 의 USERS 배열에서 관리합니다.
// (index.html의 세로 버튼 목록과 이 페이지가 같은 이름을 쓰도록 하기 위해서예요)

// 지출 항목 기본 목록 (모든 사용자 공통)
const BASE_EXPENSE_CATEGORIES = ["간식", "쇼핑", "준비물", "교통비", "책 구입", "기타"];

// "야구 직관" 항목은 2번 사용자에게만 추가로 보여줍니다.
// 다른 번호에게도 특별 항목을 주고 싶다면 아래처럼 항목을 늘리면 됩니다.
const SPECIAL_CATEGORIES = {
  2: ["야구 직관"],
};

// 수입 기록의 항목명 (수입은 별도 선택 없이 이 이름으로 고정 저장됩니다)
const INCOME_CATEGORY = "수입";

// 결제 수단 목록
const PAYMENT_METHODS = ["현금", "카드", "계좌이체", "기타"];

// 화면에 한 번에 보여줄 개월 수와, 그중 "이번달"의 위치(0부터 시작)
// 기본값: 이전전달, 이전달, 이번달, 다음달 → 이번달은 배열의 2번 인덱스
const MONTH_OFFSETS = [-2, -1, 0, 1];


// ------------------------------------------------------------
// 2. Supabase 클라이언트 준비
// ------------------------------------------------------------
// js/config.js 에 실제 값을 아직 넣지 않았거나 형식이 잘못되어 있으면
// createClient()가 즉시 오류를 던지면서 이 파일 전체 실행이 멈춰버립니다.
// (그러면 화면에 1~4번 버튼, 월 탭조차 그려지지 않는 상태가 됩니다)
// 그래서 여기서 미리 안전하게 감싸고, 문제가 있으면 화면에 안내 문구만 띄웁니다.

let db = null;
let configOk = false;

try {
  const looksLikeUrl = typeof SUPABASE_URL === "string" && SUPABASE_URL.startsWith("http");
  const hasKey = typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY.length > 20;
  if (!looksLikeUrl || !hasKey) {
    throw new Error("config.js에 Supabase URL/키가 아직 입력되지 않았습니다.");
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  configOk = true;
} catch (err) {
  console.warn("Supabase 설정이 아직 완료되지 않았어요:", err.message);
}


// ------------------------------------------------------------
// 3. URL의 ?user=번호 값으로 이 페이지가 몇 번 기입장인지 결정
// ------------------------------------------------------------
// index.html의 세로 버튼이 ledger.html?user=1 처럼 실제로 페이지를 이동시키고,
// 이 페이지는 그 번호를 읽어서 그 사람의 기록만 보여줍니다.

const requestedUserNo = Number(new URLSearchParams(window.location.search).get("user"));
const matchedUser = USERS.find((u) => u.no === requestedUserNo);

if (!matchedUser) {
  // 번호가 없거나 잘못된 경우(예: ledger.html을 직접 열었을 때) 처음 화면으로 돌려보냅니다.
  window.location.href = "index.html";
}

// ------------------------------------------------------------
// 4. 화면 상태
// ------------------------------------------------------------

const state = {
  currentUser: matchedUser ? matchedUser.no : null, // 이 페이지가 담당하는 사용자 번호 (고정)
  monthWindow: [],              // 화면에 표시할 4개월 정보 배열
  selectedMonthIndex: 2,        // monthWindow 안에서 현재 보고 있는 탭 (기본: 이번달)
  transactions: [],             // 현재 선택된 사용자+월의 기록 목록
  editingId: null,              // 지금 인라인 수정 중인 행의 id (없으면 null)
  unlockedMonths: new Set(),    // "이 달도 수정하기"로 임시 잠금 해제한 monthWindow 인덱스 목록
                                 // (새로고침하면 초기화되어 다시 이번달만 수정 가능한 상태로 돌아갑니다)
};


// ------------------------------------------------------------
// 5. 초기화
// ------------------------------------------------------------

function init() {
  if (!matchedUser) return; // 위에서 이미 index.html로 이동 처리 중

  document.getElementById("pageTitle").textContent = `${matchedUser.name} 용돈기입장`;
  document.title = `${matchedUser.name} 용돈기입장`;
  document.getElementById("todayLabel").textContent =
    formatDateLabel(new Date()) + " 기준";

  state.monthWindow = buildMonthWindow(new Date());
  // "이번달"에 해당하는 탭을 기본 선택 상태로 맞춥니다.
  state.selectedMonthIndex = state.monthWindow.findIndex((m) => m.isCurrent);

  renderMonthTabs();

  if (!configOk) {
    // Supabase 설정이 안 되어 있어도 화면 골격(탭 등)은 보이도록 하고,
    // 표 자리에는 안내 문구만 띄웁니다.
    document.getElementById("emptyState").style.display = "block";
    document.getElementById("emptyState").textContent =
      "⚠️ js/config.js 에 Supabase URL과 anon key를 먼저 입력해주세요.";
    return;
  }

  loadAndRender();
}

// 오늘 날짜를 기준으로 [이전전달, 이전달, 이번달, 다음달] 4개월 정보를 만듭니다.
// "다음달이 되면 이전 데이터는 넘어가고 다다음달이 보인다"는 요구사항은
// 이 함수가 항상 "오늘"을 기준으로 새로 계산되기 때문에 자동으로 해결됩니다.
// (지난 기록은 지우지 않고, 화면에 표시되는 4개월 범위만 매달 자연스럽게 밀려납니다)
function buildMonthWindow(today) {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0~11

  return MONTH_OFFSETS.map((offset) => {
    const d = new Date(y, m + offset, 1);
    return {
      year: d.getFullYear(),
      month: d.getMonth(), // 0~11
      isCurrent: offset === 0,
      label: `${d.getMonth() + 1}월`,
    };
  });
}


// ------------------------------------------------------------
// 6. 월 탭 (이전전달 / 이전달 / 이번달 / 다음달)
// ------------------------------------------------------------

function renderMonthTabs() {
  const nav = document.getElementById("monthTabs");
  nav.innerHTML = "";

  state.monthWindow.forEach((m, index) => {
    const tab = document.createElement("button");
    tab.className = "month-tab";
    tab.dataset.active = String(index === state.selectedMonthIndex);
    const lockLabel = m.isCurrent
      ? ""
      : state.unlockedMonths.has(index)
      ? `<span class="lock">임시 수정 가능</span>`
      : `<span class="lock">보기 전용</span>`;
    tab.innerHTML = `${m.year}년 ${m.label}` + lockLabel;
    tab.addEventListener("click", () => {
      state.selectedMonthIndex = index;
      state.editingId = null;
      renderMonthTabs();
      loadAndRender();
    });
    nav.appendChild(tab);
  });
}


// ------------------------------------------------------------
// 7. 데이터 불러오기 + 화면 그리기
// ------------------------------------------------------------

async function loadAndRender() {
  const month = state.monthWindow[state.selectedMonthIndex];
  const startDate = formatISODate(new Date(month.year, month.month, 1));
  const endDate = formatISODate(new Date(month.year, month.month + 1, 0)); // 그 달의 마지막 날

  const { data, error } = await db
    .from("transactions")
    .select("*")
    .eq("user_no", state.currentUser)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .order("entry_date", { ascending: true });

  if (error) {
    console.error("불러오기 실패:", error);
    alert("데이터를 불러오지 못했어요. js/config.js 의 Supabase 설정을 확인해주세요.");
    return;
  }

  state.transactions = data || [];
  renderSummary();
  renderTable();
}

function renderSummary() {
  let income = 0;
  let expense = 0;
  state.transactions.forEach((t) => {
    if (t.type === "income") income += Number(t.amount);
    else expense += Number(t.amount);
  });

  document.getElementById("totalIncome").textContent = formatWon(income);
  document.getElementById("totalExpense").textContent = formatWon(expense);
  document.getElementById("totalBalance").textContent = formatWon(income - expense);
}


// ------------------------------------------------------------
// 8. 표 렌더링
// ------------------------------------------------------------

function renderTable() {
  const month = state.monthWindow[state.selectedMonthIndex];
  const tbody = document.getElementById("ledgerBody");
  const lockedBanner = document.getElementById("lockedBanner");
  const emptyState = document.getElementById("emptyState");

  // 이번달이거나, "이 달도 수정하기"로 임시로 잠금 해제한 달이면 수정 가능
  const editable = month.isCurrent || state.unlockedMonths.has(state.selectedMonthIndex);

  if (month.isCurrent) {
    lockedBanner.style.display = "none";
  } else if (editable) {
    lockedBanner.style.display = "block";
    lockedBanner.innerHTML = `🔓 이번 화면을 보는 동안만 임시로 수정할 수 있어요. (새로고침하면 다시 잠깁니다)`;
  } else {
    lockedBanner.style.display = "block";
    lockedBanner.innerHTML = `🔒 이 달은 지난 달(또는 다음 달) 기록이라 수정할 수 없어요. 보기만 가능합니다.
      <button id="unlockMonthBtn" class="btn ghost-unlock">이 달도 수정하기</button>`;
    document.getElementById("unlockMonthBtn").addEventListener("click", () => {
      if (confirm("이 달 기록도 임시로 수정할 수 있게 열까요? (새로고침하면 다시 잠겨요)")) {
        state.unlockedMonths.add(state.selectedMonthIndex);
        renderMonthTabs();
        renderTable();
      }
    });
  }

  tbody.innerHTML = "";

  state.transactions.forEach((t) => {
    if (state.editingId === t.id) {
      tbody.appendChild(buildEditRow(t));
    } else {
      tbody.appendChild(buildReadRow(t, editable));
    }
  });

  emptyState.style.display = state.transactions.length === 0 ? "block" : "none";

  // 이번달이거나 임시로 잠금 해제한 달이면 맨 아래에 "새 항목 추가" 입력 줄을 보여줍니다.
  if (editable) {
    tbody.appendChild(buildNewRow());
  }
}

// 읽기 전용(또는 편집 버튼이 달린) 한 줄
function buildReadRow(t, editable) {
  const tr = document.createElement("tr");
  const typeLabel = t.type === "income" ? "수입" : "지출";
  const amountSign = t.type === "income" ? "+" : "-";

  tr.innerHTML = `
    <td>${formatDateShort(t.entry_date)}</td>
    <td><span class="tag ${t.type}">${typeLabel}</span></td>
    <td>${escapeHtml(t.category)}</td>
    <td class="amount-cell ${t.type}">${amountSign}${formatWon(t.amount)}</td>
    <td>${escapeHtml(t.payment_method)}</td>
    <td>${escapeHtml(t.memo || "")}</td>
    <td class="row-actions"></td>
  `;

  if (editable) {
    const actions = tr.querySelector(".row-actions");

    const editBtn = document.createElement("button");
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => {
      state.editingId = t.id;
      renderTable();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => deleteTransaction(t.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
  }

  return tr;
}

// 기존 항목을 고치는 중일 때의 입력 줄
function buildEditRow(t) {
  const tr = document.createElement("tr");
  tr.className = "edit-row";

  const month = state.monthWindow[state.selectedMonthIndex];
  const bounds = monthDateBounds(month);
  const dateInput = inputEl("date", t.entry_date);
  dateInput.min = bounds.min;
  dateInput.max = bounds.max;
  const typeSelect = selectEl(
    [["income", "수입"], ["expense", "지출"]],
    t.type
  );
  const categoryCell = document.createElement("td");
  const amountWrap = amountInputWrap(t.amount);
  const paymentSelect = selectEl(
    PAYMENT_METHODS.map((p) => [p, p]),
    t.payment_method
  );
  const memoInput = inputEl("text", t.memo || "");

  function refreshCategoryField() {
    categoryCell.innerHTML = "";
    if (typeSelect.value === "income") {
      const span = document.createElement("span");
      span.textContent = INCOME_CATEGORY;
      categoryCell.appendChild(span);
    } else {
      const sel = selectEl(
        getExpenseCategories(state.currentUser).map((c) => [c, c]),
        t.category
      );
      categoryCell.appendChild(sel);
    }
  }
  typeSelect.addEventListener("change", refreshCategoryField);
  refreshCategoryField();

  const tdDate = document.createElement("td"); tdDate.appendChild(dateInput);
  const tdType = document.createElement("td"); tdType.appendChild(typeSelect);
  const tdAmount = document.createElement("td"); tdAmount.appendChild(amountWrap);
  const tdPayment = document.createElement("td"); tdPayment.appendChild(paymentSelect);
  const tdMemo = document.createElement("td"); tdMemo.appendChild(memoInput);
  const tdActions = document.createElement("td");
  tdActions.className = "row-actions";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "저장";
  saveBtn.addEventListener("click", () => {
    const amount = readAmountValue(amountWrap);
    if (!amount || amount <= 0) {
      alert("금액을 숫자로 입력해주세요.");
      return;
    }
    if (dateInput.value < bounds.min || dateInput.value > bounds.max) {
      alert(`날짜는 ${month.year}년 ${month.month + 1}월 안에서만 고를 수 있어요.`);
      return;
    }
    updateTransaction(t.id, {
      entry_date: dateInput.value,
      type: typeSelect.value,
      category: typeSelect.value === "income" ? INCOME_CATEGORY : categoryCell.querySelector("select").value,
      amount,
      payment_method: paymentSelect.value,
      memo: memoInput.value,
    });
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", () => {
    state.editingId = null;
    renderTable();
  });

  tdActions.appendChild(saveBtn);
  tdActions.appendChild(cancelBtn);

  tr.appendChild(tdDate);
  tr.appendChild(tdType);
  tr.appendChild(categoryCell);
  tr.appendChild(tdAmount);
  tr.appendChild(tdPayment);
  tr.appendChild(tdMemo);
  tr.appendChild(tdActions);

  return tr;
}

// 맨 아래 "새 항목 추가" 입력 줄 (이번달에서만 보임)
function buildNewRow() {
  const tr = document.createElement("tr");
  tr.className = "new-row";

  const month = state.monthWindow[state.selectedMonthIndex];
  const todayIso = formatISODate(new Date());
  // 오늘이 이번달 범위 안이면 오늘 날짜를, 아니면 이번달 1일을 기본값으로 사용
  const defaultDate = todayIso.slice(0, 7) === `${month.year}-${pad2(month.month + 1)}`
    ? todayIso
    : `${month.year}-${pad2(month.month + 1)}-01`;

  const bounds = monthDateBounds(month);
  const dateInput = inputEl("date", defaultDate);
  dateInput.min = bounds.min;
  dateInput.max = bounds.max;
  const typeSelect = selectEl([["expense", "지출"], ["income", "수입"]], "expense");
  const categoryCell = document.createElement("td");
  const amountWrap = amountInputWrap("");
  const paymentSelect = selectEl(PAYMENT_METHODS.map((p) => [p, p]), "현금");
  const memoInput = inputEl("text", "");
  memoInput.placeholder = "메모 (선택)";

  function refreshCategoryField() {
    categoryCell.innerHTML = "";
    if (typeSelect.value === "income") {
      const span = document.createElement("span");
      span.textContent = INCOME_CATEGORY;
      categoryCell.appendChild(span);
    } else {
      const sel = selectEl(getExpenseCategories(state.currentUser).map((c) => [c, c]));
      categoryCell.appendChild(sel);
    }
  }
  typeSelect.addEventListener("change", refreshCategoryField);
  refreshCategoryField();

  const tdDate = document.createElement("td"); tdDate.appendChild(dateInput);
  const tdType = document.createElement("td"); tdType.appendChild(typeSelect);
  const tdAmount = document.createElement("td"); tdAmount.appendChild(amountWrap);
  const tdPayment = document.createElement("td"); tdPayment.appendChild(paymentSelect);
  const tdMemo = document.createElement("td"); tdMemo.appendChild(memoInput);
  const tdActions = document.createElement("td");
  tdActions.className = "row-actions";

  const addBtn = document.createElement("button");
  addBtn.className = "btn primary";
  addBtn.textContent = "추가";
  addBtn.addEventListener("click", () => {
    const amount = readAmountValue(amountWrap);
    if (!dateInput.value) {
      alert("날짜를 선택해주세요.");
      return;
    }
    if (dateInput.value < bounds.min || dateInput.value > bounds.max) {
      alert(`날짜는 ${month.year}년 ${month.month + 1}월 안에서만 고를 수 있어요.`);
      return;
    }
    if (!amount || amount <= 0) {
      alert("금액을 숫자로 입력해주세요.");
      return;
    }
    addTransaction({
      user_no: state.currentUser,
      entry_date: dateInput.value,
      type: typeSelect.value,
      category: typeSelect.value === "income" ? INCOME_CATEGORY : categoryCell.querySelector("select").value,
      amount,
      payment_method: paymentSelect.value,
      memo: memoInput.value,
    });
  });

  tdActions.appendChild(addBtn);

  tr.appendChild(tdDate);
  tr.appendChild(tdType);
  tr.appendChild(categoryCell);
  tr.appendChild(tdAmount);
  tr.appendChild(tdPayment);
  tr.appendChild(tdMemo);
  tr.appendChild(tdActions);

  return tr;
}


// ------------------------------------------------------------
// 9. Supabase 쓰기 (추가 / 수정 / 삭제)
// ------------------------------------------------------------

async function addTransaction(payload) {
  const { error } = await db.from("transactions").insert(payload);
  if (error) {
    console.error(error);
    alert("추가에 실패했어요: " + error.message);
    return;
  }
  await loadAndRender();
}

async function updateTransaction(id, payload) {
  const { error } = await db.from("transactions").update(payload).eq("id", id);
  if (error) {
    console.error(error);
    alert("수정에 실패했어요: " + error.message);
    return;
  }
  state.editingId = null;
  await loadAndRender();
}

async function deleteTransaction(id) {
  if (!confirm("이 기록을 삭제할까요?")) return;
  const { error } = await db.from("transactions").delete().eq("id", id);
  if (error) {
    console.error(error);
    alert("삭제에 실패했어요: " + error.message);
    return;
  }
  await loadAndRender();
}


// ------------------------------------------------------------
// 10. 자잘한 도우미 함수들
// ------------------------------------------------------------

function getExpenseCategories(userNo) {
  const extra = SPECIAL_CATEGORIES[userNo] || [];
  return [...BASE_EXPENSE_CATEGORIES, ...extra];
}

// 지금 보고 있는 달의 첫날/마지막날을 "YYYY-MM-DD" 문자열로 반환합니다.
// 날짜 입력칸(달력)이 이 범위 밖 날짜를 고르지 못하게 막는 데 씁니다.
// (이렇게 안 하면 예를 들어 9월 화면에서 날짜만 7월로 바꿔서 추가해버리면
//  7월 데이터로 몰래 들어가버려서 "지난달은 잠긴다"는 규칙이 무력화돼요)
function monthDateBounds(month) {
  const first = `${month.year}-${pad2(month.month + 1)}-01`;
  const lastDay = new Date(month.year, month.month + 1, 0).getDate();
  const last = `${month.year}-${pad2(month.month + 1)}-${pad2(lastDay)}`;
  return { min: first, max: last };
}

function inputEl(type, value) {
  const el = document.createElement("input");
  el.type = type;
  el.value = value;
  return el;
}

function selectEl(options, selectedValue) {
  const el = document.createElement("select");
  options.forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === selectedValue) opt.selected = true;
    el.appendChild(opt);
  });
  return el;
}

// 금액 입력칸: 숫자만 입력받고 "원"을 자동으로 붙여 보여줍니다.
function amountInputWrap(initialAmount) {
  const wrap = document.createElement("div");
  wrap.className = "amount-input-wrap";

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.placeholder = "0";
  if (initialAmount !== "" && initialAmount != null) {
    input.value = Number(initialAmount).toLocaleString("ko-KR");
  }

  // 숫자 이외의 문자는 입력 즉시 제거하고, 천 단위 콤마를 자동으로 넣어줍니다.
  input.addEventListener("input", () => {
    const digitsOnly = input.value.replace(/[^0-9]/g, "");
    input.value = digitsOnly ? Number(digitsOnly).toLocaleString("ko-KR") : "";
  });

  const suffix = document.createElement("span");
  suffix.className = "won-suffix";
  suffix.textContent = "원";

  wrap.appendChild(input);
  wrap.appendChild(suffix);
  return wrap;
}

function readAmountValue(amountWrapEl) {
  const input = amountWrapEl.querySelector("input");
  const digitsOnly = input.value.replace(/[^0-9]/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

function formatWon(amount) {
  return Number(amount).toLocaleString("ko-KR") + "원";
}

function formatISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDateShort(isoDate) {
  const [, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function formatDateLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}


// ------------------------------------------------------------
// 11. 시작!
// ------------------------------------------------------------
init();
