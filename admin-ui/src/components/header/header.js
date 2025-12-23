class AdminHeader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.render();
  }

  render() {
    const tpl = document.createElement("template");
    tpl.innerHTML = `
      <style>
        :host { display: block; }
        .top-navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }
        .page-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-dark, #333);
        }
        .top-actions {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-light, #888);
          position: relative;
        }
        /* Ensure Material Icons ligatures render inside Shadow DOM */
        .material-icons-outlined {
          font-family: 'Material Icons Outlined';
          font-weight: normal;
          font-style: normal;
          font-size: 24px;
          display: inline-block;
          line-height: 1;
          text-transform: none;
          letter-spacing: normal;
          word-wrap: normal;
          white-space: nowrap;
          direction: ltr;
          -webkit-font-feature-settings: 'liga';
          -webkit-font-smoothing: antialiased;
        }
        .badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background-color: red;
          color: white;
          font-size: 0.7rem;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .user-profile {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: #ddd;
          overflow: hidden;
        }
        .user-profile img { width:100%; height:100%; object-fit:cover }
      </style>

      <header class="top-navbar" role="navigation" aria-label="Admin header">
        <h1 class="page-title"><span id="titleText">Dashboard</span></h1>
        <div class="top-actions">
          <button class="icon-btn" title="Marketplace">
            <span class="material-icons-outlined">storefront</span>
          </button>
          <button class="icon-btn" title="Notifications" id="notifBtn">
            <span class="material-icons-outlined">notifications</span>
            <span class="badge" id="notifBadge" style="display:none">0</span>
          </button>
          <button class="icon-btn" id="settingsBtn" title="Configurações">
            <span class="material-icons-outlined">settings</span>
          </button>
                   <div class="user-profile" id="profile">
            <img src="https://placehold.co/40x40/333/fff?text=User" alt="User Profile" />
          </div>
        </div>
      </header>
    `;

    this.shadowRoot.appendChild(tpl.content.cloneNode(true));

    this._notifBadge = this.shadowRoot.getElementById("notifBadge");
    this._notifBtn = this.shadowRoot.getElementById("notifBtn");
    this._titleEl = this.shadowRoot.getElementById("titleText");
    this._notifBtn.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("admin:notifications:open", { bubbles: true })
      );
    });
    const settings = this.shadowRoot.getElementById("settingsBtn");
    if (settings) {
      settings.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.dispatchEvent(
          new CustomEvent("admin:settings:open", { bubbles: true })
        );
      });
    }
  }

  connectedCallback() {
    if (!this._inited) {
      this._inited = true;
      this.update();
    }
  }

  static get observedAttributes() {
    return ["notifications", "title"];
  }

  attributeChangedCallback(name) {
    if (name === "notifications") this.update();
    if (name === "title") this._applyTitle();
  }

  update(data) {
    // title takes precedence from attribute
    this._applyTitle();

    try {
      let count = 0;
      if (data && typeof data.notifications !== "undefined")
        count = Number(data.notifications) || 0;
      else if (this.hasAttribute("notifications"))
        count = Number(this.getAttribute("notifications")) || 0;
      // expose global override
      else if (
        window &&
        window.__admin_header &&
        typeof window.__admin_header.notifications !== "undefined"
      )
        count = Number(window.__admin_header.notifications) || 0;

      if (count > 0) {
        this._notifBadge.textContent = String(count);
        this._notifBadge.style.display = "flex";
      } else {
        this._notifBadge.style.display = "none";
      }
    } catch (e) {
      // noop
    }
  }

  _applyTitle() {
    try {
      const attr = this.getAttribute("title");
      if (attr && this._titleEl) this._titleEl.textContent = attr;
    } catch (e) {
      // ignore
    }
  }
}

customElements.define("admin-header", AdminHeader);

export default AdminHeader;
