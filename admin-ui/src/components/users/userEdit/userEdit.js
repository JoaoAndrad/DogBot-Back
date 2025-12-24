async function ensureCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
  // wait for load or error (best-effort)
  await new Promise((res) => {
    link.addEventListener("load", () => res());
    link.addEventListener("error", () => res());
    // fallback timeout
    setTimeout(res, 500);
  });
}

function qParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function fmtJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return "";
  }
}

async function fetchUser(id) {
  const r = await fetch(`/admin/api/users/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

async function patchUser(id, data) {
  const r = await fetch(`/admin/api/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

function setValue(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = v == null ? "" : v;
}

function getValue(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  return el.value;
}

// Helper: Converte data BR (DD/MM/YYYY) para ISO para compatibilidade com o calendário
function brDateToIso(dateStr) {
  if (!dateStr) return "";
  // Se já parecer ISO, retorna
  if (dateStr.includes("-") && dateStr.includes("T")) return dateStr;

  // Regex para DD/MM/YYYY
  const brMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [_, dd, mm, yyyy] = brMatch;
    // Retorna ISO no início do dia
    return `${yyyy}-${mm}-${dd}T09:00:00.000Z`;
  }
  return dateStr;
}

export default async function initUserEdit() {
  const id = qParam("id");
  if (!id) return;
  const root = document.getElementById("userEditCard");
  if (!root) return;
  // ensure component stylesheet is loaded
  try {
    await ensureCss("/admin/static/src/components/users/userEdit.css");
  } catch (e) {}

  try {
    const u = await fetchUser(id);
    console.debug("[admin] userEdit fetched user:", u);

    // Estrutura de dados baseada no JSON fornecido
    // Prioridade: metadata.raw > raiz > dogfort
    const raw = (u.metadata && u.metadata.raw) || {};
    const metaDf = (u.metadata && u.metadata.dogfort) || {};
    const rootConfissoes = u.confissoes || raw.confissoes || {};

    // === POPULAÇÃO DOS CAMPOS ===
    setValue("editDisplay", u.display_name || raw.name || "");
    setValue("editSender", u.sender_number || raw.senderNumber || "");

    // Saldo: Pega de u.confissoes ou raw.confissoes
    const saldoVal = rootConfissoes.saldo ?? raw.saldo ?? metaDf.saldo;
    setValue("dfSaldo", saldoVal != null ? String(saldoVal) : "");

    // Mensal
    const mensalVal = raw.mensal ?? metaDf.mensal;
    setValue("dfMensal", mensalVal != null ? String(mensalVal) : "");

    // Anual
    const anualVal = raw.anual ?? metaDf.anual;
    setValue("dfAnual", anualVal != null ? String(anualVal) : "");

    // Plan
    const planVal = raw.plan ?? metaDf.plan;
    setValue("dfPlan", planVal || "");

    // Troféus
    const trofeusVal = raw.trofeus ?? metaDf.trofeus;
    setValue("dfTrofeus", trofeusVal != null ? String(trofeusVal) : "");

    // Meta Anual
    const metaAnualVal = raw.meta_anual ?? raw.metaAnual ?? metaDf.meta_anual;
    setValue("dfMetaAnual", metaAnualVal != null ? String(metaAnualVal) : "");

    // Último Treino (com conversão de data BR para ISO)
    const ultimoTreinoRaw =
      raw.ultimoTreino ?? raw.ultimo_treino ?? metaDf.ultimo_treino;
    setValue("dfUltimoTreino", brDateToIso(ultimoTreinoRaw));
  } catch (e) {
    console.error("Failed to load user for edit", e);
  }

  // helper: convert ISO datetime to input[type=datetime-local] value
  function isoToDatetimeLocal(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  // open a small modal datetime-local picker and write ISO to target input
  function openDateTimePicker(targetInput) {
    if (!targetInput) return;
    if (document.getElementById("usereditCalendarOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "usereditCalendarOverlay";
    overlay.className = "useredit-calendar-overlay";

    const box = document.createElement("div");
    box.className = "useredit-calendar";

    const dt = document.createElement("input");
    dt.type = "datetime-local";
    // O valor do input alvo já deve estar em ISO graças ao brDateToIso
    dt.value = isoToDatetimeLocal(targetInput.value || "");

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn btn-primary";
    ok.textContent = "OK";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Cancel";

    box.appendChild(dt);
    box.appendChild(ok);
    box.appendChild(cancel);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    // close when clicking backdrop
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) {
        overlay.remove();
        document.body.style.overflow = "";
      }
    });

    cancel.addEventListener("click", () => {
      overlay.remove();
      document.body.style.overflow = "";
    });

    ok.addEventListener("click", () => {
      const v = dt.value;
      if (!v) {
        targetInput.value = "";
      } else {
        // dt.value is local; convert to ISO
        const d = new Date(v);
        targetInput.value = d.toISOString();
      }
      overlay.remove();
      document.body.style.overflow = "";
    });

    // focus the datetime input
    dt.focus();
  }

  // attach picker to último treino input
  const ultimoEl = document.getElementById("dfUltimoTreino");
  if (ultimoEl) {
    ultimoEl.addEventListener("click", (e) => {
      e.preventDefault();
      openDateTimePicker(ultimoEl);
    });
    ultimoEl.addEventListener("focus", (e) => {
      openDateTimePicker(ultimoEl);
    });
  }

  const saveBtn = document.getElementById("saveUserBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");

  if (cancelBtn)
    cancelBtn.addEventListener("click", () => {
      const overlay = document.getElementById("userEditOverlay");
      if (overlay && overlay.parentNode)
        overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = "";
      const btn = document.getElementById("editProfileBtn");
      if (btn) btn.disabled = false;
    });

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      // only collect the requested fields
      const payload = {
        sender_number: getValue("editSender") || undefined,
        display_name: getValue("editDisplay") || undefined,
        dogfort: {
          saldo: getValue("dfSaldo") ? Number(getValue("dfSaldo")) : undefined,
          mensal: getValue("dfMensal")
            ? Number(getValue("dfMensal"))
            : undefined,
          anual: getValue("dfAnual") ? Number(getValue("dfAnual")) : undefined,
          plan: getValue("dfPlan") || undefined,
          trofeus: getValue("dfTrofeus")
            ? Number(getValue("dfTrofeus"))
            : undefined,
          meta_anual: getValue("dfMetaAnual")
            ? Number(getValue("dfMetaAnual"))
            : undefined,
          ultimo_treino: getValue("dfUltimoTreino") || undefined,
        },
      };

      try {
        await patchUser(id, payload);
        // simple feedback and close overlay then reload
        alert("User updated");
        const overlay = document.getElementById("userEditOverlay");
        if (overlay && overlay.parentNode)
          overlay.parentNode.removeChild(overlay);
        document.body.style.overflow = "";
        window.location.reload();
      } catch (e) {
        console.error("Failed to save user", e);
        alert("Failed to save user: " + (e && e.message));
      }
    });
  }
}
