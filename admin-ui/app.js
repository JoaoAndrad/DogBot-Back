document.addEventListener("DOMContentLoaded", () => {
  const out = document.getElementById("output");
  const btnStatus = document.getElementById("btn-status");
  const btnPolls = document.getElementById("btn-polls");
  const btnDbDebug = document.getElementById("btn-dbdebug");
  const btnTestIntrospect = document.getElementById("btn-test-introspect");
  const btnGrant = document.getElementById("btn-grant");
  const btnReconnect = document.getElementById("btn-reconnect");

  btnStatus.addEventListener("click", async () => {
    out.textContent = "Loading...";
    try {
      const r = await fetch("/admin/db-status", { credentials: "include" });
      const j = await r.json();
      out.textContent = JSON.stringify(j, null, 2);
    } catch (e) {
      out.textContent = String(e);
    }
  });

  btnPolls.addEventListener("click", async () => {
    out.textContent = "Loading...";
    try {
      const r = await fetch("/admin/polls", { credentials: "include" });
      const j = await r.json();
      out.textContent = JSON.stringify(j, null, 2);
    } catch (e) {
      out.textContent = String(e);
    }
  });

  btnDbDebug &&
    btnDbDebug.addEventListener("click", async () => {
      out.textContent = "Loading DB debug...";
      try {
        const r = await fetch("/admin/db-debug", { credentials: "include" });
        const j = await r.json();
        out.textContent = JSON.stringify(j, null, 2);
      } catch (e) {
        out.textContent = String(e);
      }
    });

  btnTestIntrospect &&
    btnTestIntrospect.addEventListener("click", async () => {
      out.textContent = "Loading test_introspect...";
      try {
        const r = await fetch("/admin/test_introspect", {
          credentials: "include",
        });
        const j = await r.json();
        out.textContent = JSON.stringify(j, null, 2);
      } catch (e) {
        out.textContent = String(e);
      }
    });

  btnGrant &&
    btnGrant.addEventListener("click", async () => {
      if (
        !confirm(
          "Executar GRANTs para squarecloud? Isso modificará permissões no banco de dados."
        )
      )
        return;
      out.textContent = "Granting permissions...";
      try {
        const r = await fetch("/admin/grant-permissions", {
          method: "POST",
          credentials: "include",
        });
        const j = await r.json();
        out.textContent = JSON.stringify(j, null, 2);
      } catch (e) {
        out.textContent = String(e);
      }
    });

  btnReconnect &&
    btnReconnect.addEventListener("click", async () => {
      if (!confirm("Recreate Prisma client and test connection?")) return;
      out.textContent = "Recreating Prisma client...";
      try {
        const r = await fetch("/admin/reconnect", {
          method: "POST",
          credentials: "include",
        });
        const j = await r.json();
        out.textContent = JSON.stringify(j, null, 2);
      } catch (e) {
        out.textContent = String(e);
      }
    });
});
