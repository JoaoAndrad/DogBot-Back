class AdminSidebar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.render();
  }

  render() {
    const tpl = document.createElement("template");
    tpl.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        @import url('https://fonts.googleapis.com/icon?family=Material+Icons+Outlined');

        :host { display: block; height: 100vh; }
        .sidebar {
          width: 260px;
          background-color: #3b76e1;
          color: #fff;
          padding: 20px;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          height: 100vh; /* ensure full viewport height */
          position: sticky;
          top: 0; /* keep sidebar fixed to top when content scrolls */
        }
        .brand { display:flex; flex-direction:column; align-items:center; margin-bottom:40px; }
        .brand-logo-placeholder { width:80px; height:80px; border-radius:50%; margin-bottom:10px; overflow:hidden; display:block; }
        .brand-logo-placeholder img{ width:100%; height:100%; object-fit:cover; display:block }
        .brand h2{ font-size:1.2rem; font-weight:600; }

        .menu-list { list-style:none; padding:0; margin:0; }
        .menu-item { margin-bottom:5px }
        .menu-link { display:flex; align-items:center; padding:12px 15px; text-decoration:none; color: rgba(255,255,255,0.9); border-radius:10px; transition:0.3s; font-size:0.95rem }
        .menu-link:hover, .menu-link.active { background-color: rgba(255,255,255,0.12); color:#fff }
        .menu-link span.material-icons-outlined { margin-right:15px; font-size:1.3rem }
        .menu-link .chevron { margin-left:auto; font-size:1.1rem }

        @media (max-width:768px){
          .sidebar{ width:100%; padding:10px; flex-direction:row; justify-content:space-between; align-items:center }
          .brand{ margin-bottom:0; flex-direction:row; gap:10px }
          .brand-logo-placeholder{ width:40px; height:40px }
        }
      </style>

      <aside class="sidebar" role="navigation" aria-label="Admin sidebar">
        <div class="brand">
          <div class="brand-logo-placeholder">
            <img src="/admin/logo.svg" alt="DogBot logo" onerror="this.onerror=null;this.src='/admin/static/logo.svg'" />
          </div>
          <h2>DogBot Admin</h2>
        </div>

        <ul class="menu-list">
          <li class="menu-item"><a href="/admin/static/src/pages/Home/index.html" class="menu-link"><span class="material-icons-outlined">dashboard</span>Dashboard</a></li>
          <li class="menu-item"><a href="/admin/static/src/pages/Users/index.html" class="menu-link"><span class="material-icons-outlined">people</span>Usuários</a></li>
          <li class="menu-item"><a href="#" class="menu-link"><span class="material-icons-outlined">music_note</span>Spotify</a></li>
          <li class="menu-item"><a href="#" class="menu-link"><span class="material-icons-outlined">fitness_center</span>DogFort <span class="material-icons-outlined chevron">chevron_right</span></a></li>
          <li class="menu-item"><a href="#" class="menu-link"><span class="material-icons-outlined">settings</span>Configurações</a></li>
          <li class="menu-item"><a href="#" class="menu-link"><span class="material-icons-outlined">description</span>Logs</a></li>
          <li class="menu-item"><a href="#" class="menu-link" style="align-items:flex-start"><span class="material-icons-outlined">storage</span><div style="display:flex;flex-direction:column"><span>Database Status</span><span style="font-size:0.75rem;opacity:0.7">(Prisma)</span></div><span class="material-icons-outlined chevron" style="margin-top:5px">chevron_right</span></a></li>
        </ul>
      </aside>
    `;

    this.shadowRoot.appendChild(tpl.content.cloneNode(true));
    // mark active menu item based on current URL
    try {
      this.updateActive();
      // update on history navigation
      window.addEventListener("popstate", () => this.updateActive());
      window.addEventListener("hashchange", () => this.updateActive());
    } catch (e) {
      // ignore
    }
  }

  updateActive() {
    const anchors = Array.from(this.shadowRoot.querySelectorAll(".menu-link"));
    // normalize path: remove index.html and trailing slash
    const normalize = (p) => {
      try {
        const url = new URL(
          p,
          window.location.origin + window.location.pathname
        );
        let path = url.pathname || "/";
        path = path.replace(/index\.html$/, "").replace(/\/$/, "");
        return path === "" ? "/" : path;
      } catch (e) {
        try {
          return p.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
        } catch (e2) {
          return "/";
        }
      }
    };

    const currentPath = normalize(
      window.location.pathname || window.location.href
    );
    for (const a of anchors) {
      try {
        const href = a.getAttribute("href") || "";
        const linkPath = normalize(href);
        const isActive = linkPath === currentPath;
        if (isActive) a.classList.add("active");
        else a.classList.remove("active");
      } catch (e) {
        // ignore
      }
    }
  }
}

customElements.define("admin-sidebar", AdminSidebar);

export default AdminSidebar;
