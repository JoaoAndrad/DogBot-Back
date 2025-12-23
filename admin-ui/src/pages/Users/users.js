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

async function doFetch(url, method = "GET", body) {
  try {
    const opts = { method, cache: "no-store" };
    if (body) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(url, opts);
    let data = null;
    try {
      data = await r.json();
    } catch (e) {
      /* ignore */
    }
    if (!r.ok) {
      const err = (data && data.error) || r.statusText || "Request failed";
      throw new Error(err);
    }
    return data;
  } catch (e) {
    console.error("doFetch error", e);
    throw e;
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
  const newUserBtn = document.getElementById("newUserBtn");

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
      // build the same structure as the static placeholder so styles apply
      const userCell = document.createElement("div");
      userCell.className = "user-cell";

      const avatarDiv = document.createElement("div");
      avatarDiv.className = "user-avatar";
      if (u.avatar_url) {
        const img = document.createElement("img");
        img.src = u.avatar_url;
        img.alt = u.display_name || "avatar";
        avatarDiv.appendChild(img);
      } else {
        const initials = (u.display_name || u.push_name || "")
          .split(" ")
          .map((s) => s[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        avatarDiv.textContent = initials || "DB";
      }

      const infoDiv = document.createElement("div");
      infoDiv.className = "user-info";
      const nameSpan = document.createElement("span");
      nameSpan.className = "name";
      nameSpan.textContent = u.display_name || u.push_name || "-";
      const phoneSpan = document.createElement("span");
      phoneSpan.className = "phone";
      phoneSpan.textContent = u.sender_number || "-";

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(phoneSpan);
      userCell.appendChild(avatarDiv);
      userCell.appendChild(infoDiv);
      nameTd.appendChild(userCell);

      const phoneTd = document.createElement("td");
      // keep phone column for compatibility but leave blank (info shown in name column)
      phoneTd.textContent = "";
      const pushTd = document.createElement("td");
      pushTd.textContent = u.push_name || "-";
      const lastTd = document.createElement("td");
      lastTd.textContent = fmtDate(u.last_seen);
      const createdTd = document.createElement("td");
      createdTd.textContent = fmtDate(u.created_at);
      const actionsTd = document.createElement("td");
      actionsTd.className = "actions";

      const viewBtn = makeActionBtn("View", "btn ghost");
      viewBtn.addEventListener("click", () => {
        const url = `/admin/static/src/pages/Users/user_id/index.html?id=${encodeURIComponent(
          id
        )}`;
        if (window && window.__admin_navigateTo) window.__admin_navigateTo(url);
        else location.href = url;
      });
      const editBtn = makeActionBtn("Edit", "btn ghost");
      editBtn.addEventListener("click", () => showEditModal(u));
      const delBtn = makeActionBtn("Delete", "btn ghost");
      delBtn.addEventListener("click", () => {
        confirmDestructive(async () => {
          try {
            delBtn.disabled = true;
            await doFetch(`${API_BASE}/${encodeURIComponent(id)}`, "DELETE");
            alert("Usuário apagado com sucesso");
            // refresh list
            await fetchList();
          } catch (e) {
            alert("Falha ao apagar usuário: " + (e.message || e));
          } finally {
            delBtn.disabled = false;
          }
        });
      });

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
      // row click navigates to detail (ignore clicks on controls)
      tr.addEventListener("click", (e) => {
        if (e.target.closest("input,button,a")) return;
        const url = `/admin/static/src/pages/Users/user_id/index.html?id=${encodeURIComponent(
          id
        )}`;
        if (window && window.__admin_navigateTo) window.__admin_navigateTo(url);
        else location.href = url;
      });
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
      "Confirmar exclusão em massa dos usuários selecionados?"
    );
    if (!ok) return;
    (async () => {
      try {
        bulkDelete.disabled = true;
        const ids = Array.from(selected);
        const res = await doFetch(`${API_BASE}/bulk`, "POST", {
          ids,
          action: "delete",
        });
        alert(`Bulk action completa — removidos: ${res.count || 0}`);
        selected.clear();
        await fetchList();
      } catch (e) {
        alert("Falha na ação em massa: " + (e.message || e));
      } finally {
        bulkDelete.disabled = false;
      }
    })();
  });

  if (newUserBtn) {
    newUserBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      showCreateModal();
    });
  }

  async function showEditModal(user) {
    // If we only got an id, fetch full user
    let u = user;
    if (!u || !u.id) {
      const data = await getJson(`${API_BASE}/${encodeURIComponent(user)}`);
      if (!data) return alert("Falha ao carregar usuário");
      u = data;
    }
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
    box.style.maxWidth = "600px";
    box.style.maxHeight = "80vh";
    box.style.overflow = "auto";

    const title = document.createElement("h3");
    title.textContent = "Editar usuário";

    const form = document.createElement("div");
    form.style.display = "grid";
    form.style.gridGap = "8px";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Display name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = u.display_name || u.push_name || "";

    const pushLabel = document.createElement("label");
    pushLabel.textContent = "Push name";
    const pushInput = document.createElement("input");
    pushInput.type = "text";
    pushInput.value = u.push_name || "";

    const btnRow = document.createElement("div");
    btnRow.style.marginTop = "8px";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn primary";
    saveBtn.textContent = "Salvar";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn ghost";
    cancelBtn.textContent = "Cancelar";

    cancelBtn.addEventListener("click", () => document.body.removeChild(modal));

    saveBtn.addEventListener("click", async () => {
      try {
        saveBtn.disabled = true;
        const payload = {
          display_name: nameInput.value.trim(),
          push_name: pushInput.value.trim(),
        };
        await doFetch(
          `${API_BASE}/${encodeURIComponent(u.id || u.sender_number)}`,
          "PATCH",
          payload
        );
        alert("Usuário atualizado");
        document.body.removeChild(modal);
        await fetchList();
      } catch (e) {
        alert("Falha ao atualizar: " + (e.message || e));
      } finally {
        saveBtn.disabled = false;
      }
    });

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);

    form.appendChild(nameLabel);
    form.appendChild(nameInput);
    form.appendChild(pushLabel);
    form.appendChild(pushInput);
    form.appendChild(btnRow);

    const close = document.createElement("button");
    close.textContent = "Close";
    close.className = "btn ghost";
    close.style.float = "right";
    close.addEventListener("click", () => document.body.removeChild(modal));

    box.appendChild(close);
    box.appendChild(title);
    box.appendChild(form);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  async function showCreateModal() {
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
    box.style.maxWidth = "600px";
    box.style.maxHeight = "80vh";
    box.style.overflow = "auto";

    const title = document.createElement("h3");
    title.textContent = "Novo usuário";

    const form = document.createElement("div");
    form.style.display = "grid";
    form.style.gridGap = "8px";

    const phoneLabel = document.createElement("label");
    phoneLabel.textContent = "Phone (sender_number) *";
    const phoneInput = document.createElement("input");
    phoneInput.type = "text";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Display name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";

    const pushLabel = document.createElement("label");
    pushLabel.textContent = "Push name";
    const pushInput = document.createElement("input");
    pushInput.type = "text";

    const btnRow = document.createElement("div");
    btnRow.style.marginTop = "8px";

    const createBtn = document.createElement("button");
    createBtn.className = "btn primary";
    createBtn.textContent = "Criar";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn ghost";
    cancelBtn.textContent = "Cancelar";

    cancelBtn.addEventListener("click", () => document.body.removeChild(modal));

    createBtn.addEventListener("click", async () => {
      try {
        if (!phoneInput.value.trim())
          return alert("sender_number é obrigatório");
        createBtn.disabled = true;
        const payload = {
          sender_number: phoneInput.value.trim(),
          display_name: nameInput.value.trim() || null,
          push_name: pushInput.value.trim() || null,
        };
        const res = await doFetch(API_BASE, "POST", payload);
        alert("Usuário criado com sucesso");
        document.body.removeChild(modal);
        await fetchList();
      } catch (e) {
        alert("Falha ao criar usuário: " + (e.message || e));
      } finally {
        createBtn.disabled = false;
      }
    });

    btnRow.appendChild(createBtn);
    btnRow.appendChild(cancelBtn);

    form.appendChild(phoneLabel);
    form.appendChild(phoneInput);
    form.appendChild(nameLabel);
    form.appendChild(nameInput);
    form.appendChild(pushLabel);
    form.appendChild(pushInput);
    form.appendChild(btnRow);

    const close = document.createElement("button");
    close.textContent = "Close";
    close.className = "btn ghost";
    close.style.float = "right";
    close.addEventListener("click", () => document.body.removeChild(modal));

    box.appendChild(close);
    box.appendChild(title);
    box.appendChild(form);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }
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

// auto-init when loaded on the Users page (support dynamic import)
if (
  typeof document !== "undefined" &&
  document.getElementById("usersContainer")
) {
  // call immediately if the container exists (initial load or after router replacement)
  initUsersPage().catch((e) => console.error(e));
}

export default initUsersPage;
