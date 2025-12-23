document.addEventListener("DOMContentLoaded", () => {
  const totalUsers = document.getElementById("totalUsers");
  const activeGroups = document.getElementById("activeGroups");
  const pollsCreated = document.getElementById("pollsCreated");
  const recentList = document.getElementById("recentList");
  const dbStatus = document.getElementById("dbStatus");

  async function safeFetchJson(path, opts = {}) {
    try {
      const res = await fetch(
        path,
        Object.assign({ credentials: "include" }, opts)
      );
      if (!res.ok)
        return {
          error: res.status,
          status: res.status,
          text: await res.text().catch(() => ""),
        };
      return await res.json();
    } catch (e) {
      return { error: "network", message: String(e) };
    }
  }

  async function refreshMetrics() {
    // polls count
    const pollsRes = await safeFetchJson("/api/polls/");
    let pollsCount = 0;
    if (Array.isArray(pollsRes)) pollsCount = pollsRes.length;
    else if (pollsRes && pollsRes.count) pollsCount = pollsRes.count;
    pollsCreated.querySelector(".value")?.remove();
    pollsCreated
      .querySelector(".label")
      ?.after(
        Object.assign(document.createElement("div"), {
          className: "value",
          textContent: String(pollsCount),
        })
      );

    // placeholder users/groups (no API yet)
    totalUsers.querySelector(".value")?.remove();
    totalUsers
      .querySelector(".label")
      ?.after(
        Object.assign(document.createElement("div"), {
          className: "value",
          textContent: "1,250",
        })
      );
    activeGroups.querySelector(".value")?.remove();
    activeGroups
      .querySelector(".label")
      ?.after(
        Object.assign(document.createElement("div"), {
          className: "value",
          textContent: "45",
        })
      );

    // db status
    const db = await safeFetchJson("/admin/db-status");
    if (db && db.status === "connected") {
      dbStatus.textContent = "Operational";
      dbStatus.className = "status operational";
    } else {
      dbStatus.textContent = db && db.message ? String(db.message) : "Error";
      dbStatus.className = "status error";
    }

    // recent logs
    const logs = await safeFetchJson("/admin/logs?limit=8");
    recentList.innerHTML = "";
    if (logs && logs.ok && Array.isArray(logs.logs) && logs.logs.length) {
      logs.logs.reverse().forEach((l) => {
        const el = document.createElement("div");
        el.className = "activity-item";
        el.textContent =
          l.ts + " — " + l.level + " — " + l.text.substring(0, 400);
        recentList.appendChild(el);
      });
    } else {
      const el = document.createElement("div");
      el.className = "activity-item empty";
      el.textContent = "No recent activity";
      recentList.appendChild(el);
    }
  }

  // actions
  document.getElementById("btn-grant")?.addEventListener("click", async () => {
    if (!confirm("Executar GRANTs para squarecloud?")) return;
    const r = await safeFetchJson("/admin/grant-permissions", {
      method: "POST",
    });
    alert(JSON.stringify(r));
    refreshMetrics();
  });
  document
    .getElementById("btn-reconnect")
    ?.addEventListener("click", async () => {
      if (!confirm("Recreate Prisma client and test connection?")) return;
      const r = await safeFetchJson("/admin/reconnect", { method: "POST" });
      alert(JSON.stringify(r));
      refreshMetrics();
    });
  document
    .getElementById("btn-dbdebug")
    ?.addEventListener("click", async () => {
      const r = await safeFetchJson("/admin/db-debug");
      alert(JSON.stringify(r, null, 2));
    });

  // initial fetch
  refreshMetrics();
  // refresh periodically
  setInterval(refreshMetrics, 30_000);
});
