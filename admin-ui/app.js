document.addEventListener('DOMContentLoaded', () => {
  const out = document.getElementById('output');
  const btnStatus = document.getElementById('btn-status');
  const btnPolls = document.getElementById('btn-polls');

  btnStatus.addEventListener('click', async () => {
    out.textContent = 'Loading...';
    try {
      const r = await fetch('/admin/db-status', { credentials: 'include' });
      const j = await r.json();
      out.textContent = JSON.stringify(j, null, 2);
    } catch (e) {
      out.textContent = String(e);
    }
  });

  btnPolls.addEventListener('click', async () => {
    out.textContent = 'Loading...';
    try {
      const r = await fetch('/admin/polls', { credentials: 'include' });
      const j = await r.json();
      out.textContent = JSON.stringify(j, null, 2);
    } catch (e) {
      out.textContent = String(e);
    }
  });
});
