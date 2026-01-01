async function getJson(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.log("fetch error", url, e);
    return null;
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setDbBadge(status) {
  const el = document.getElementById("dbBadge");
  if (!el) return;
  if (status && status.ok) {
    el.style.backgroundColor = "#2ecc71";
    el.title = "DB: OK";
  } else {
    el.style.backgroundColor = "#e74c3c";
    el.title = "DB: ERROR";
  }
}

async function updateDbStatus() {
  const data = await getJson("/admin/db-status");
  setDbBadge(data);
}

async function updatePollsCount() {
  const polls = await getJson("/api/polls");
  if (Array.isArray(polls)) {
    setText("statTotalUsers", polls.length.toString());
  }
}

function renderLogs(logs) {
  const list = document.getElementById("recentList");
  if (!list) return;
  list.innerHTML = "";
  if (!logs || logs.length === 0) {
    const li = document.createElement("li");
    li.className = "activity-item empty";
    li.textContent = "No recent activity";
    list.appendChild(li);
    return;
  }
  for (const entry of logs.slice(0, 20)) {
    const li = document.createElement("li");
    li.className = "activity-item";
    const time = new Date(entry.time || Date.now()).toLocaleString();
    li.innerHTML = `
      <div class="activity-icon-container">
        <div class="activity-icon-circle blue"><span class="material-icons-outlined">radio_button_checked</span></div>
      </div>
      <div class="activity-details">
        <p>${(entry.level || "log").toUpperCase()}: ${escapeHtml(
      entry.msg || entry.message || ""
    )}</p>
        <span class="time">${time}</span>
      </div>
    `;
    list.appendChild(li);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function updateLogs() {
  const data = await getJson("/admin/logs?limit=50");
  if (!data) return;
  let logs = [];
  if (Array.isArray(data)) logs = data;
  else if (data.logs) logs = data.logs;
  renderLogs(logs);
}

async function refreshAll() {
  await Promise.all([updateDbStatus(), updatePollsCount(), updateLogs()]);
}

window.addEventListener("load", () => {
  refreshAll();
  setInterval(refreshAll, 30_000);
});
