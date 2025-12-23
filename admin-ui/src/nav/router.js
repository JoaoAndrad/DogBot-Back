// Simple client-side router to load only <main class="main-content"> from internal pages
const ROOT_PREFIX = "/admin/static/src/pages/";

async function fetchPage(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return await res.text();
}

function parseHTML(html) {
  const dp = new DOMParser();
  return dp.parseFromString(html, "text/html");
}

function isInternal(href) {
  try {
    const u = new URL(href, location.href);
    return u.origin === location.origin && u.pathname.startsWith(ROOT_PREFIX);
  } catch (e) {
    return false;
  }
}

async function applyContentFromDoc(doc) {
  const newMain =
    doc.querySelector("main.main-content") ||
    doc.querySelector("main") ||
    doc.body;
  if (!newMain) return;
  const currentMain = document.querySelector("main.main-content");
  if (!currentMain) return;
  // Copy styles from fetched document into current document head
  try {
    const existingLinks = new Set(
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
        (l) => l.href
      )
    );

    // External stylesheets
    for (const link of Array.from(
      doc.querySelectorAll('link[rel="stylesheet"]')
    )) {
      if (!link.href) continue;
      if (!existingLinks.has(link.href)) {
        const nl = document.createElement("link");
        nl.rel = "stylesheet";
        nl.href = link.href;
        document.head.appendChild(nl);
      }
    }

    // Inline <style> tags
    for (const st of Array.from(doc.querySelectorAll("style"))) {
      // avoid duplicating identical style blocks naively by comparing text
      const text = st.textContent && st.textContent.trim();
      if (!text) continue;
      const exists = Array.from(document.querySelectorAll("style")).some(
        (s) => s.textContent && s.textContent.trim() === text
      );
      if (!exists) {
        const ns = document.createElement("style");
        ns.textContent = text;
        document.head.appendChild(ns);
      }
    }
  } catch (e) {
    console.warn("Error applying styles from fetched page", e);
  }

  // Replace inner HTML
  currentMain.innerHTML = newMain.innerHTML;

  // Execute scripts found in the fetched doc
  const scripts = Array.from(doc.querySelectorAll("script"));
  for (const s of scripts) {
    try {
      if (s.type === "module" && s.src) {
        // dynamic import the module
        await import(s.src);
      } else if (s.src) {
        // regular external script
        await new Promise((res, rej) => {
          const sc = document.createElement("script");
          sc.src = s.src;
          sc.onload = res;
          sc.onerror = rej;
          document.body.appendChild(sc);
        });
      } else if (s.type !== "module" && s.textContent) {
        // inline script
        const sc = document.createElement("script");
        sc.textContent = s.textContent;
        document.body.appendChild(sc);
      }
    } catch (e) {
      console.warn("Error loading script", e);
    }
  }

  // update active menu
  const sidebar = document.querySelector("admin-sidebar");
  if (sidebar && typeof sidebar.updateActive === "function")
    sidebar.updateActive();
}

export async function navigateTo(url, replace = false) {
  try {
    const html = await fetchPage(url);
    const doc = parseHTML(html);
    await applyContentFromDoc(doc);
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  } catch (e) {
    console.error("Navigation error", e);
    // fallback to full load
    location.href = url;
  }
}

function onClick(e) {
  const a = e.target.closest && e.target.closest("a");
  if (!a || !a.href) return;
  if (isInternal(a.href)) {
    e.preventDefault();
    navigateTo(a.href);
  }
}

window.addEventListener("click", onClick);
window.addEventListener("popstate", () => {
  // load current path via router if internal
  const p = location.pathname + location.search + location.hash;
  if (p.startsWith(ROOT_PREFIX)) navigateTo(p, true);
});

// expose for debugging
window.__admin_navigateTo = navigateTo;
