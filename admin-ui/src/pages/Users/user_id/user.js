function qParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function fmtDate(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch (e) {
    return ts;
  }
}

async function fetchUser(id) {
  const url = `/admin/api/users/${encodeURIComponent(id)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

function clearTimeline() {
  const ul = document.getElementById("timelineList");
  if (ul) ul.innerHTML = "";
}

function pushTimelineItem(title, time) {
  const ul = document.getElementById("timelineList");
  if (!ul) return;
  const li = document.createElement("li");
  li.className = "timeline-item";
  const div = document.createElement("div");
  div.className = "timeline-content";
  const p = document.createElement("p");
  p.className = "title";
  p.textContent = title;
  const s = document.createElement("span");
  s.className = "time";
  s.textContent = fmtDate(time);
  div.appendChild(p);
  div.appendChild(s);
  li.appendChild(div);
  ul.appendChild(li);
}

async function init() {
  const id = qParam("id");
  if (!id) return console.warn("No user id in querystring");
  try {
    const u = await fetchUser(id);
    // header
    const nameEl = document.getElementById("userName");
    const phoneEl = document.getElementById("userPhone");
    const joinedEl = document.getElementById("userJoined");
    if (nameEl)
      nameEl.textContent =
        u.display_name || u.push_name || u.sender_number || "Usuário";
    if (phoneEl) phoneEl.textContent = u.sender_number || "-";
    if (joinedEl)
      joinedEl.textContent = u.created_at
        ? `Joined ${fmtDate(u.created_at)}`
        : "-";

    // tolerant DogFort object lookup (available for multiple places)
    const df =
      u.dogfort ||
      u.dogFortStats ||
      u.dogFort ||
      (u.metadata && u.metadata.dogfort) ||
      {};

    // right-column fields
    const senderEl = document.getElementById("senderNumber");
    const displayEl = document.getElementById("displayName");
    const createdEl = document.getElementById("createdAt");
    const dogfortEl = document.getElementById("dogfortResumo");
    if (senderEl) senderEl.textContent = u.sender_number || "-";
    if (displayEl) displayEl.textContent = u.display_name || u.push_name || "-";
    if (createdEl)
      createdEl.textContent = u.created_at ? fmtDate(u.created_at) : "-";
    if (dogfortEl) {
      // debug helper to inspect what's returned from the API when empty
      try {
        console.log("[admin] dogfort object:", df);
      } catch (e) {}
      const parts = [];
      if (df.saldo != null) parts.push(`Saldo: ${df.saldo}`);
      if (df.mensal != null) parts.push(`Mensal: ${df.mensal}`);
      if (df.anual != null) parts.push(`Anual: ${df.anual}`);
      if (df.meta_anual != null) parts.push(`Meta anual: ${df.meta_anual}`);
      if (df.ultimo_treino)
        parts.push(`Último treino: ${fmtDate(df.ultimo_treino)}`);
      dogfortEl.textContent = parts.length ? parts.join(" • ") : "-";
    }

    // status badge
    const statusBadge = document.getElementById("statusBadge");
    const statusText = document.getElementById("statusBadgeText");
    if (statusBadge && statusText) {
      const active =
        (u.metadata && (u.metadata.active || u.metadata.is_active)) || false;
      if (active) {
        statusBadge.classList.add("active");
        statusText.textContent = "Active";
      } else {
        statusBadge.classList.remove("active");
        statusText.textContent = "Inactive";
      }
    }

    // quick stats
    const totalInteractions = document.getElementById("totalInteractionsValue");
    const lastActive = document.getElementById("lastActiveValue");
    const dogfortPlan = document.getElementById("dogfortPlanValue");
    if (totalInteractions)
      totalInteractions.textContent =
        (u.metadata && u.metadata.interactions_count) || "-";
    if (lastActive)
      lastActive.textContent = fmtDate(
        u.last_seen || u.lastSeen || (u.metadata && u.metadata.last_seen)
      );
    if (dogfortPlan) {
      // prefer explicit 'plan' string, fallback to saldo summary
      if (df && df.plan) dogfortPlan.textContent = df.plan;
      else if (df && (df.anual || df.mensal))
        dogfortPlan.textContent = `Saldo:${df.saldo || 0}`;
      else dogfortPlan.textContent = "-";
    }

    // render activity log into the tab content (separated into function)
    function renderActivityLog(user) {
      const tabContent = document.querySelector(".tab-content");
      if (!tabContent) return;
      tabContent.innerHTML =
        '<ul id="timelineList" class="timeline-list"></ul>';
      clearTimeline();
      if (Array.isArray(user.pushNameHistory) && user.pushNameHistory.length) {
        for (const p of user.pushNameHistory.slice().reverse()) {
          const title = `Push name: ${p.push_name}`;
          const ts = p.ts ? Number(p.ts) : null;
          pushTimelineItem(title, ts || p.ts || user.created_at);
        }
      } else if (user.metadata && Array.isArray(user.metadata.activity)) {
        for (const ev of user.metadata.activity.slice().reverse()) {
          pushTimelineItem(
            ev.title || ev.type || "event",
            ev.ts || ev.time || ev.created_at
          );
        }
      } else {
        pushTimelineItem("Sem atividade registrada", null);
      }
    }

    function renderSpotifyReport(user) {
      const tabContent = document.querySelector(".tab-content");
      if (!tabContent) return;
      tabContent.innerHTML = `
        <div class="card">
          <h3>Spotify</h3>
          <p class="info-value">Sem dados do Spotify por enquanto.</p>
        </div>`;
    }

    function renderDogfortReport(user) {
      const tabContent = document.querySelector(".tab-content");
      if (!tabContent) return;
      // Simple DogFort summary placeholder
      const df = user.dogfort || (user.metadata && user.metadata.dogfort) || {};
      const parts = [];
      if (df.saldo != null) parts.push(`Saldo: ${df.saldo}`);
      if (df.mensal != null) parts.push(`Mensal: ${df.mensal}`);
      if (df.anual != null) parts.push(`Anual: ${df.anual}`);
      tabContent.innerHTML = `
        <div class="card">
          <h3>DogFort Data</h3>
          <p class="info-value">${
            parts.length
              ? parts.join(" • ")
              : "Sem dados do DogFort por enquanto."
          }</p>
        </div>`;
    }

    // attach tab handlers
    function attachTabHandlers(user) {
      const tabs = document.querySelectorAll(".tab-btn");
      tabs.forEach((btn, idx) => {
        btn.addEventListener("click", () => {
          tabs.forEach((t) => t.classList.remove("active"));
          btn.classList.add("active");
          const label = btn.textContent && btn.textContent.trim().toLowerCase();
          if (label && label.startsWith("activity")) {
            renderActivityLog(user);
          } else if (label && label.startsWith("spotify")) {
            renderSpotifyReport(user);
          } else if (label && label.startsWith("dogfort")) {
            renderDogfortReport(user);
          } else {
            renderActivityLog(user);
          }
        });
      });
    }

    // initial render: activity log
    attachTabHandlers(u);
    renderActivityLog(u);

    // populate admin notes if present
    const notesEl = document.getElementById("adminNotes");
    if (notesEl && u.metadata && u.metadata.admin_notes)
      notesEl.value = u.metadata.admin_notes;
  } catch (e) {
    console.log("Failed to load user", e);
    // visible error feedback
    const nameEl = document.getElementById("userName");
    const phoneEl = document.getElementById("userPhone");
    if (nameEl) nameEl.textContent = "Erro ao carregar usuário";
    if (phoneEl) phoneEl.textContent = (e && e.message) || "Erro";
  }
}

document.addEventListener("DOMContentLoaded", init);

export default init;
