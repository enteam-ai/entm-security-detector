import './index.css';

const app = document.getElementById('app');
const badge = document.getElementById('badge');
const status = document.getElementById('status');
const subtitle = document.getElementById('subtitle');
const detectionsEl = document.getElementById('detections');
const lastScanEl = document.getElementById('lastScan');
const rescanBtn = document.getElementById('rescan');

function render(result) {
  if (result.error) {
    app.className = 'state-error';
    badge.textContent = 'Error';
    status.textContent = 'Scan failed';
    subtitle.textContent = result.error;
    detectionsEl.innerHTML = '';
  } else if (result.clean) {
    app.className = 'state-clean';
    badge.textContent = 'Clean';
    status.textContent = 'Environment clean';
    subtitle.textContent = 'No AI interview assistants detected. You may proceed.';
    detectionsEl.innerHTML = '';
  } else {
    app.className = 'state-dirty';
    badge.textContent = `${result.detections.length} detected`;
    status.textContent = 'AI helper tools detected';
    subtitle.textContent = 'Please close the following apps before continuing:';
    detectionsEl.innerHTML = result.detections
      .map(d => `
        <li>
          <strong>${escapeHtml(d.matched)}</strong>
          <span class="meta">${escapeHtml(d.source)} — ${escapeHtml(d.label || '')}</span>
        </li>
      `)
      .join('');
  }

  const ts = new Date(result.scannedAt).toLocaleTimeString();
  lastScanEl.textContent = `Last scan: ${ts}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

window.detectorAPI.onScanResult(render);

rescanBtn.addEventListener('click', async () => {
  rescanBtn.disabled = true;
  try {
    const result = await window.detectorAPI.scanNow();
    render(result);
  } finally {
    rescanBtn.disabled = false;
  }
});
