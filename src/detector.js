const BLOCKLIST = [
  { needle: 'parakeet',  display: 'Parakeet AI' },
  { needle: 'cluely',    display: 'Cluely' },
  { needle: 'otter',     display: 'Otter.ai' },
  { needle: 'granola',   display: 'Granola' },
  { needle: 'fireflies', display: 'Fireflies.ai' },
  { needle: 'fathom',    display: 'Fathom' },
  { needle: 'tldv',      display: 'tl;dv' },
  { needle: 'tl;dv',     display: 'tl;dv' },
  { needle: 'rewind',    display: 'Rewind.ai' },
  { needle: 'readai',    display: 'Read AI' },
  { needle: 'read.ai',   display: 'Read AI' },

  // --- TEST-ONLY ENTRIES (remove before demo) ---
  { needle: 'notepad',   display: '[TEST] Notepad' },
  { needle: 'claude',    display: '[TEST] Claude' },
  { needle: 'calc',      display: '[TEST] Calculator' },
];

let psListPromise;
let activeWinPromise;

function loadPsList() {
  if (!psListPromise) psListPromise = import('ps-list').then(m => m.default);
  return psListPromise;
}

function loadActiveWin() {
  if (!activeWinPromise) activeWinPromise = import('active-win').then(m => m);
  return activeWinPromise;
}

function matchBlocklist(haystack) {
  if (!haystack) return null;
  const lower = haystack.toLowerCase();
  for (const entry of BLOCKLIST) {
    if (lower.includes(entry.needle)) return entry.display;
  }
  return null;
}

async function scanProcesses() {
  const psList = await loadPsList();
  const procs = await psList();
  const hits = [];
  for (const p of procs) {
    const matched = matchBlocklist(p.name) || matchBlocklist(p.cmd);
    if (matched) {
      hits.push({ source: 'process', pid: p.pid, label: p.name, matched });
    }
  }
  return hits;
}

async function scanWindows() {
  try {
    const activeWin = await loadActiveWin();
    if (typeof activeWin.getOpenWindows !== 'function') return [];
    const windows = await activeWin.getOpenWindows();
    const hits = [];
    for (const w of windows) {
      const title = w.title || '';
      const owner = w.owner?.name || '';
      const matched = matchBlocklist(title) || matchBlocklist(owner);
      if (matched) {
        hits.push({ source: 'window', label: title || owner, matched });
      }
    }
    return hits;
  } catch {
    return [];
  }
}

function dedupe(detections) {
  const seen = new Set();
  const out = [];
  for (const d of detections) {
    const key = `${d.matched}|${d.source}|${d.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

async function scanForHelpers() {
  const [procHits, winHits] = await Promise.all([scanProcesses(), scanWindows()]);
  const detections = dedupe([...procHits, ...winHits]);
  return {
    clean: detections.length === 0,
    detections,
    scannedAt: new Date().toISOString(),
  };
}

module.exports = { scanForHelpers };
