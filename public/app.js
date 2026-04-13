const API_BASE = '/api/requests';

document.addEventListener('DOMContentLoaded', () => {
  fetchRequests();

  // Auto-refresh every 2.5 seconds
  // Pauses refresh if any header dropdown is currently open to prevent annoying HTML resets
  setInterval(() => {
    if (!document.querySelector('.headers-list.show')) {
      fetchRequests();
    }
  }, 2500);

  document.getElementById('btn-refresh').addEventListener('click', () => {
    fetchRequests();
    addPulseEffect('btn-refresh');
  });

  document.getElementById('btn-export').addEventListener('click', async () => {
    try {
      const res = await fetch(API_BASE + '/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: 'all_pending' })
      });
      const data = await res.json();
      if (data.success) {
        if (data.text.trim().length === 0) {
          alert('No pending requests to export!');
          return;
        }
        downloadStringAsFile(data.text, 'aria2_downloads.txt');
        fetchRequests();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to export requests.');
    }
  });

  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all exported requests from the database?')) return;
    try {
      const res = await fetch(API_BASE + '/clear', { method: 'POST' });
      const data = await res.json();
      if (data.success) fetchRequests();
    } catch (err) {
      console.error(err);
      alert('Failed to clear exported requests.');
    }
  });

  document.getElementById('btn-delete-all').addEventListener('click', async () => {
    if (!confirm('Are you SURE you want to completely delete ALL requests from the database (including pending ones)? This cannot be undone!')) return;
    try {
      const res = await fetch(API_BASE + '/clear-all', { method: 'POST' });
      const data = await res.json();
      if (data.success) fetchRequests();
    } catch (err) {
      console.error(err);
      alert('Failed to delete all requests.');
    }
  });
});

async function fetchRequests() {
  try {
    const res = await fetch(API_BASE);
    const data = await res.json();
    renderTable(data);
    updateStats(data);
  } catch (err) {
    console.error('Failed to load requests', err);
    document.getElementById('table-body').innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load data. Is the server running?</td></tr>';
  }
}

function updateStats(data) {
  let pending = 0;
  let exported = 0;
  data.forEach(item => {
    if (item.status === 'pending') pending++;
    else if (item.status === 'exported') exported++;
  });

  document.getElementById('stat-pending').innerText = pending;
  document.getElementById('stat-exported').innerText = exported;
  document.getElementById('stat-total').innerText = data.length;
}

function escapeHtml(unsafe) {
  return (unsafe || '').toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderTable(data) {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML =
      '<tr>' +
      '<td colspan="6" class="empty-state">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>' +
      '<p>No requests captured yet.</p>' +
      '<p style="font-size:0.85rem; margin-top:8px;">Send requests to http://localhost:6800/jsonrpc</p>' +
      '</td>' +
      '</tr>';
    return;
  }

  data.forEach(req => {
    const tr = document.createElement('tr');

    // Status Badge
    const statusClass = req.status === 'pending' ? 'badge-pending' : 'badge-exported';

    // Date Formatting
    const date = new Date(req.created_at + 'Z');
    const dateStr = date.toLocaleString();

    // Headers rendering
    let headersHtml = '';
    if (req.headers && req.headers.length > 0) {
      const headersJoined = req.headers.map(h => "<div>" + escapeHtml(h) + "</div>").join("");
      headersHtml = [
        '<div class="headers-toggle" onclick="this.nextElementSibling.classList.toggle(\'show\')">',
        'SHOW HEADERS (' + req.headers.length + ')',
        '</div>',
        '<div class="headers-list">',
        headersJoined,
        '</div>'
      ].join('');
    }

    const outName = req.out_filename ? escapeHtml(req.out_filename) : '<span style="color:#94a3b8; font-style:italic">Not specified</span>';

    tr.innerHTML =
      '<td>#' + req.id + '</td>' +
      '<td class="url-cell">' +
      '<span class="url-text">' + escapeHtml(req.url) + '</span>' +
      headersHtml +
      '</td>' +
      '<td>' + outName + '</td>' +
      '<td><span class="badge ' + statusClass + '">' + req.status + '</span></td>' +
      '<td style="color:var(--text-muted); font-size:0.85rem;">' + dateStr + '</td>' +
      '<td>' +
      '<button class="btn-danger-icon" onclick="deleteRequest(' + req.id + ')" title="Delete">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>' +
      '</button>' +
      '</td>';

    tbody.appendChild(tr);
  });
}

async function deleteRequest(id) {
  if (!confirm('Delete this request?')) return;
  try {
    const res = await fetch(API_BASE + '/' + id, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) fetchRequests();
  } catch (err) {
    console.error(err);
    alert('Failed to delete request.');
  }
}

function downloadStringAsFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.style.display = 'none';
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function addPulseEffect(elId) {
  const el = document.getElementById(elId);
  el.style.transform = 'scale(0.9)';
  setTimeout(() => {
    el.style.transform = 'scale(1)';
  }, 100);
}
