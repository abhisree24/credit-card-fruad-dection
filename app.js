const STORAGE_KEY = "sentinel-transaction-history-v1";

const demoTransactions = [
  { id: "demo-1", merchant: "Northstar Market", amount: 68.4, location: "Austin, TX", timeOfDay: "afternoon", cardType: "credit", level: "low", score: 8, signals: ["Typical amount and daytime purchase"], createdAt: "Today, 2:42 PM" },
  { id: "demo-2", merchant: "Pixel Forge Digital", amount: 1299, location: "Online", timeOfDay: "overnight", cardType: "virtual", level: "medium", score: 48, signals: ["Higher-than-routine amount", "Transaction made overnight", "Virtual card requires additional review"], createdAt: "Today, 12:18 AM" },
  { id: "demo-3", merchant: "GiftCard Direct", amount: 4820, location: "Online · International", timeOfDay: "overnight", cardType: "prepaid", level: "high", score: 87, signals: ["High-value purchase", "Gift card merchant category", "Unfamiliar or international location", "Transaction made overnight", "Prepaid card requires additional review"], createdAt: "Yesterday, 11:56 PM" },
  { id: "demo-4", merchant: "Harbor & Pine", amount: 142.75, location: "Seattle, WA", timeOfDay: "morning", cardType: "debit", level: "low", score: 4, signals: ["Typical amount and daytime purchase"], createdAt: "Yesterday, 9:16 AM" }
];

const riskLabels = { low: "Low risk", medium: "Medium risk", high: "High risk" };
const cardLabels = { credit: "Credit", debit: "Debit", virtual: "Virtual", prepaid: "Prepaid" };
const timeLabels = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", overnight: "Overnight" };

let history = loadHistory();
let lastResult = null;

const form = document.querySelector("#transactionForm");
const historyBody = document.querySelector("#historyBody");
const emptyHistory = document.querySelector("#emptyHistory");
const riskFilter = document.querySelector("#riskFilter");
const riskResult = document.querySelector("#riskResult");
const formError = document.querySelector("#formError");
const toast = document.querySelector("#toast");

document.querySelector("#todayDate").textContent = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric"
}).format(new Date());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const amount = Number(values.amount);

  if (!values.merchant.trim() || !values.location.trim() || !Number.isFinite(amount) || amount <= 0) {
    formError.textContent = "Add a merchant, location, and transaction amount greater than $0.";
    return;
  }

  formError.textContent = "";
  const assessment = assessTransaction({ ...values, amount, merchant: values.merchant.trim(), location: values.location.trim() });
  const transaction = {
    id: `check-${Date.now()}`,
    merchant: values.merchant.trim(),
    amount,
    location: values.location.trim(),
    timeOfDay: values.timeOfDay,
    cardType: values.cardType,
    ...assessment,
    createdAt: "Just now"
  };

  history.unshift(transaction);
  saveHistory();
  lastResult = transaction;
  renderResult(transaction);
  renderDashboard();
  renderHistory();
  showToast(`${riskLabels[transaction.level]} assessment saved to your review log.`);
});

riskFilter.addEventListener("change", renderHistory);
document.querySelector("#clearHistory").addEventListener("click", () => {
  if (!history.length) return;
  history = [];
  saveHistory();
  renderDashboard();
  renderHistory();
  showToast("Review history cleared.");
});

function assessTransaction(transaction) {
  const signals = [];
  let score = 0;
  const merchant = transaction.merchant.toLowerCase();
  const location = transaction.location.toLowerCase();

  if (transaction.amount >= 5000) {
    score += 42;
    signals.push("High-value purchase exceeds $5,000");
  } else if (transaction.amount >= 1000) {
    score += 25;
    signals.push("Higher-than-routine amount exceeds $1,000");
  } else if (transaction.amount >= 500) {
    score += 12;
    signals.push("Amount is above the routine review threshold");
  }

  if (/(crypto|gift\s*card|gambl|casino|wire|money transfer|digital currency)/.test(merchant)) {
    score += 26;
    signals.push("Merchant category is commonly targeted for fraud");
  }

  if (/(international|overseas|abroad|unknown)/.test(location)) {
    score += 20;
    signals.push("Location indicates an unfamiliar or international purchase");
  } else if (/(online|e-?commerce|web)/.test(location)) {
    score += 7;
    signals.push("Card-not-present online transaction");
  }

  if (transaction.timeOfDay === "overnight") {
    score += 19;
    signals.push("Transaction made overnight (12am–6am)");
  }

  if (transaction.cardType === "prepaid") {
    score += 14;
    signals.push("Prepaid card requires additional review");
  } else if (transaction.cardType === "virtual") {
    score += 8;
    signals.push("Virtual card transaction requires a quick review");
  }

  if (!signals.length) {
    score = 6;
    signals.push("Typical amount, location, and transaction timing");
  }

  score = Math.min(score, 99);
  const level = score >= 60 ? "high" : score >= 28 ? "medium" : "low";
  return { score, level, signals };
}

function renderResult(transaction) {
  const explanation = buildExplanation(transaction);
  riskResult.className = `panel result-panel ${transaction.level}-result`;
  riskResult.innerHTML = `
    <p class="result-label">Risk assessment</p>
    <div class="risk-overview">
      <h2 class="risk-title">${riskLabels[transaction.level]}</h2>
      <span class="risk-score"><b>${transaction.score}</b> / 100</span>
    </div>
    <span class="risk-chip ${transaction.level}">${riskLabels[transaction.level]}</span>
    <div class="score-track" aria-label="Risk score ${transaction.score} out of 100"><div class="score-fill ${transaction.level}" style="width:${transaction.score}%"></div></div>
    <p class="result-explanation">${explanation}</p>
    <p class="signal-label">Why this was assessed</p>
    <ul class="signal-list">${transaction.signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join("")}</ul>
    <div class="result-bottom">
      <span class="analysis-time">ANALYZED JUST NOW</span>
      <button id="newCheckButton" class="action-link" type="button">New check</button>
    </div>`;
  document.querySelector("#newCheckButton").addEventListener("click", () => {
    document.querySelector("#amount").focus();
    document.querySelector("#transaction-check").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function buildExplanation(transaction) {
  if (transaction.level === "high") {
    return `This transaction has multiple signals that warrant immediate review. ${transaction.signals.length} risk indicators were detected before authorization.`;
  }
  if (transaction.level === "medium") {
    return `This activity is not automatically declined, but a few details fall outside the routine pattern. Review it before proceeding.`;
  }
  return "The available context aligns with a routine transaction. No material risk indicators were detected by the current rules.";
}

function renderDashboard() {
  const total = history.length;
  const high = history.filter((item) => item.level === "high").length;
  const low = history.filter((item) => item.level === "low").length;
  document.querySelector("#totalChecked").textContent = total.toLocaleString();
  document.querySelector("#reviewedDelta").textContent = `+${total} today`;
  document.querySelector("#highRiskCount").textContent = high.toLocaleString();
  document.querySelector("#highRiskRate").textContent = total ? `${Math.round((high / total) * 100)}% of checks` : "0% of checks";
  document.querySelector("#approvalRate").textContent = total ? `${Math.round((low / total) * 100)}%` : "0%";
}

function renderHistory() {
  const filter = riskFilter.value;
  const visibleTransactions = filter === "all" ? history : history.filter((item) => item.level === filter);
  historyBody.innerHTML = visibleTransactions.map((item) => `
    <tr>
      <td class="merchant-cell">${escapeHtml(item.merchant)}</td>
      <td class="amount-cell">${formatCurrency(item.amount)}</td>
      <td>${escapeHtml(item.location)}</td>
      <td>${timeLabels[item.timeOfDay]}</td>
      <td>${cardLabels[item.cardType]}</td>
      <td><span class="risk-chip ${item.level}">${riskLabels[item.level]}</span></td>
      <td class="signal-count">${item.signals.length} signal${item.signals.length === 1 ? "" : "s"}</td>
    </tr>`).join("");
  emptyHistory.hidden = visibleTransactions.length > 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : demoTransactions;
  } catch {
    return demoTransactions;
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

renderDashboard();
renderHistory();

