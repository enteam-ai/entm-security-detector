const DEFAULT_BACKEND_URL =
  process.env.ENTEAM_BACKEND_URL || 'https://api.enteam-hiring.com';
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * Creates a heartbeat sender.
 * `getBackendUrl` is a getter so the URL can be swapped at runtime (when the
 * URL scheme launch includes an `api` param pointing at the candidate's
 * actual environment — stg vs prod vs local).
 */
function createHeartbeatSender({
  getBackendUrl,
  getSessionToken,
  getLastScan,
  onStatus,
}) {
  let timer = null;
  let running = false;
  let consecutiveFailures = 0;

  async function sendOnce() {
    const token = getSessionToken();
    const scan = getLastScan();
    const backendUrl = (getBackendUrl && getBackendUrl()) || DEFAULT_BACKEND_URL;
    if (!token || !scan || !backendUrl) return;

    const base = backendUrl.replace(/\/$/, '');
    const url = `${base}/api/v1/interview/join/${encodeURIComponent(token)}/heartbeat`;
    const payload = {
      scan: {
        clean: scan.clean,
        detections: scan.detections || [],
        scannedAt: scan.scannedAt,
        error: scan.error || null,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      consecutiveFailures = 0;
      if (onStatus) onStatus({ ok: true });
    } catch (err) {
      consecutiveFailures += 1;
      if (onStatus) onStatus({ ok: false, err, consecutiveFailures });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function nextDelay() {
    if (consecutiveFailures === 0) return HEARTBEAT_INTERVAL_MS;
    return Math.min(
      HEARTBEAT_INTERVAL_MS * Math.pow(1.5, consecutiveFailures),
      MAX_BACKOFF_MS,
    );
  }

  function tick() {
    if (!running) return;
    sendOnce().finally(() => {
      if (running) timer = setTimeout(tick, nextDelay());
    });
  }

  return {
    start() {
      if (running) return;
      running = true;
      tick();
    },
    stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    isRunning() {
      return running;
    },
  };
}

module.exports = { createHeartbeatSender, DEFAULT_BACKEND_URL };
