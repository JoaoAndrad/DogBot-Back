// Simple client-side router to load only <main class="main-content"> from internal pages
const ROOT_PREFIX = "/admin/static/src/pages/";
const GLOBAL_CSS = "/admin/static/src/styles/global.css";

// ensure global stylesheet is loaded once
try {
  if (!document.head.querySelector(`link[href="${GLOBAL_CSS}"]`)) {
    const gl = document.createElement("link");
    gl.rel = "stylesheet";
    gl.href = GLOBAL_CSS;
    document.head.appendChild(gl);
  }
} catch (e) {
  console.warn("Failed to ensure global css", e);
}

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
    // Remove previously injected page-specific styles/links
    document
      .querySelectorAll("link[data-admin-page], style[data-admin-page]")
      .forEach((n) => n.remove());

    // Build set of existing (global) stylesheet hrefs to avoid duplicates
    const existingLinks = new Set(
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
        (l) => l.href
      )
    );

    // External stylesheets from fetched doc -> inject only if not present
    for (const link of Array.from(
      doc.querySelectorAll('link[rel="stylesheet"]')
    )) {
      if (!link.href) continue;
      if (!existingLinks.has(link.href)) {
        const nl = document.createElement("link");
        nl.rel = "stylesheet";
        nl.href = link.href;
        // mark as page-injected so we can remove on next navigation
        nl.setAttribute("data-admin-page", "1");
        document.head.appendChild(nl);
      }
    }

    // Inline <style> tags: avoid duplicating global inline styles
    const globalStyleTexts = new Set(
      Array.from(document.querySelectorAll("style:not([data-admin-page])")).map(
        (s) => (s.textContent || "").trim()
      )
    );
    for (const st of Array.from(doc.querySelectorAll("style"))) {
      const text = (st.textContent || "").trim();
      if (!text) continue;
      if (globalStyleTexts.has(text)) continue; // already present as global
      // append as page-specific style so we can remove it later
      const ns = document.createElement("style");
      ns.textContent = text;
      ns.setAttribute("data-admin-page", "1");
      document.head.appendChild(ns);
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
        // import module with cache-buster so top-level initialization runs on SPA navigation
        const url = new URL(s.src, location.href).toString();
        const busted =
          url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
        await import(busted);
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
  // update header if present
  const header = document.querySelector("admin-header");
  if (header && typeof header.update === "function") header.update();
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
