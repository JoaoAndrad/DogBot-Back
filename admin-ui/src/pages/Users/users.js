const API_BASE = "/admin/api/users";

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

async function getJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    console.error("fetch error", e);
    return null;
  }
}

function fmtDate(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch (e) {
    return ts;
  }
}

function makeActionBtn(text, cls = "btn") {
  const b = document.createElement("button");
  b.textContent = text;
  b.className = cls;
  return b;
}

export async function initUsersPage() {
  const searchInput = document.getElementById("searchInput");
  const perPageSelect = document.getElementById("perPage");
  const usersTbody = document.getElementById("usersTbody");
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");
  const pageInfo = document.getElementById("pageInfo");
  const paginationInfo = document.getElementById("paginationInfo");
  const selectAll = document.getElementById("selectAll");
  const bulkDelete = document.getElementById("bulkDelete");
  const exportCsv = document.getElementById("exportCsv");

  let page = 1;
  let per_page = parseInt(perPageSelect.value, 10) || 20;
  let q = "";
  let total = 0;
  let items = [];
  let selected = new Set();

  async function fetchList() {
    per_page = parseInt(perPageSelect.value, 10) || 20;
    const url = `${API_BASE}?page=${page}&per_page=${per_page}&q=${encodeURIComponent(
      q || ""
    )}`;
    const data = await getJson(url);
    // support both array and {items,total} shapes
    if (!data) {
      usersTbody.innerHTML = '<tr><td colspan="7">Erro ao carregar</td></tr>';
      return;
    }
    if (Array.isArray(data)) {
      items = data;
      total = data.length;
    } else {
      items = data.items || [];
      total = data.total || items.length;
    }
    render();
  }

  function render() {
    usersTbody.innerHTML = "";
    if (!items.length) {
      usersTbody.innerHTML =
        '<tr><td colspan="7">Nenhum usuário encontrado</td></tr>';
    }
    for (const u of items) {
      const tr = document.createElement("tr");
      const id = u.id || u.sender_number || JSON.stringify(u);

      const chkTd = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.id = id;
      cb.checked = selected.has(id);
      cb.addEventListener("change", (e) => {
        if (e.target.checked) selected.add(id);
        else selected.delete(id);
        updateSelectAll();
      });
      chkTd.appendChild(cb);

      const nameTd = document.createElement("td");
      nameTd.textContent = u.display_name || u.push_name || "-";
      const phoneTd = document.createElement("td");
      phoneTd.textContent = u.sender_number || "-";
      const pushTd = document.createElement("td");
      pushTd.textContent = u.push_name || "-";
      const lastTd = document.createElement("td");
      lastTd.textContent = fmtDate(u.last_seen);
      const createdTd = document.createElement("td");
      createdTd.textContent = fmtDate(u.created_at);
      const actionsTd = document.createElement("td");
      actionsTd.className = "actions";

      const viewBtn = makeActionBtn("View", "btn ghost");
      viewBtn.addEventListener("click", () => showDetail(id));
      const editBtn = makeActionBtn("Edit", "btn ghost");
      editBtn.addEventListener("click", () =>
        alert("Edit not implemented on server yet")
      );
      const delBtn = makeActionBtn("Delete", "btn ghost");
      delBtn.addEventListener("click", () =>
        confirmDestructive(() => alert("Delete not implemented on server yet"))
      );

      actionsTd.appendChild(viewBtn);
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);

      tr.appendChild(chkTd);
      tr.appendChild(nameTd);
      tr.appendChild(phoneTd);
      tr.appendChild(pushTd);
      tr.appendChild(lastTd);
      tr.appendChild(createdTd);
      tr.appendChild(actionsTd);
      usersTbody.appendChild(tr);
    }

    pageInfo.textContent = `Página ${page}`;
    paginationInfo.textContent = `Mostrando ${items.length} de ${total}`;
  }

  function updateSelectAll() {
    const allIds = items.map(
      (u) => u.id || u.sender_number || JSON.stringify(u)
    );
    const allSelected = allIds.length && allIds.every((id) => selected.has(id));
    selectAll.checked = !!allSelected;
  }

  function confirmDestructive(cb) {
    const ok = confirm("Ação destrutiva. Confirmar?");
    if (ok) cb();
  }

  async function showDetail(id) {
    const url = `${API_BASE}/${encodeURIComponent(id)}`;
    const data = await getJson(url);
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.left = 0;
    modal.style.top = 0;
    modal.style.right = 0;
    modal.style.bottom = 0;
    modal.style.background = "rgba(0,0,0,0.4)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    const box = document.createElement("div");
    box.style.background = "#fff";
    box.style.padding = "18px";
    box.style.borderRadius = "10px";
    box.style.width = "90%";
    box.style.maxWidth = "900px";
    box.style.maxHeight = "80vh";
    box.style.overflow = "auto";
    const close = document.createElement("button");
    close.textContent = "Close";
    close.className = "btn ghost";
    close.style.float = "right";
    close.addEventListener("click", () => document.body.removeChild(modal));
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.textContent = JSON.stringify(data, null, 2);
    box.appendChild(close);
    box.appendChild(pre);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  // events
  perPageSelect.addEventListener("change", () => {
    page = 1;
    fetchList();
  });
  prevBtn.addEventListener("click", () => {
    if (page > 1) {
      page--;
      fetchList();
    }
  });
  nextBtn.addEventListener("click", () => {
    page++;
    fetchList();
  });
  selectAll.addEventListener("change", () => {
    const inputs = usersTbody.querySelectorAll("input[type=checkbox]");
    for (const cb of inputs) {
      cb.checked = selectAll.checked;
      const id = cb.dataset.id;
      if (selectAll.checked) selected.add(id);
      else selected.delete(id);
    }
  });
  bulkDelete.addEventListener("click", () => {
    if (!selected.size) return alert("Nenhum usuário selecionado");
    const ok = confirm(
      "Bulk delete is a placeholder — endpoint not implemented. Show details?"
    );
    if (ok)
      alert("Endpoint /admin/api/users/bulk not implemented on server yet");
  });
  exportCsv.addEventListener("click", () => {
    alert("Export CSV placeholder — server-side export not implemented");
  });

  const debouncedSearch = debounce(() => {
    q = searchInput.value.trim();
    page = 1;
    fetchList();
  }, 350);
  searchInput.addEventListener("input", debouncedSearch);

  // initial load
  await fetchList();
}

// auto-init when loaded on the Users page
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("usersContainer")) {
    initUsersPage().catch((e) => console.error(e));
  }
});
