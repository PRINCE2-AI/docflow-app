const startBtn  = document.getElementById('startBtn');
const stopBtn   = document.getElementById('stopBtn');
const statusEl  = document.getElementById('status');
const badgeEl   = document.getElementById('badge');
const guideCard = document.getElementById('guideCard');
const guideLink = document.getElementById('guideLink');

// ── UI helpers ───────────────────────────────────────────────────────────────

function render({ capturing, sending, events, guideId, guideTitle, error }) {
  const count = (events || []).length;

  // Button state
  startBtn.disabled = capturing || sending;
  stopBtn.disabled  = !capturing || sending;

  // Reset conditional elements
  badgeEl.className   = '';
  guideCard.className = '';
  statusEl.className  = '';

  if (sending) {
    statusEl.textContent = 'Sending to DocFlow…';
    statusEl.className   = 'capturing';
    return;
  }

  if (error) {
    statusEl.textContent = `Error: ${error}`;
    statusEl.className   = 'error';
    return;
  }

  if (guideId) {
    statusEl.textContent = '';
    guideCard.className  = 'visible';
    guideLink.href       = `http://localhost:3000/guides/${guideId}`;
    guideLink.textContent = guideTitle
      ? `"${guideTitle}" →`
      : `View guide → (${guideId.slice(0, 8)}…)`;
    return;
  }

  if (capturing) {
    statusEl.textContent = 'Listening for clicks on the page…';
    statusEl.className   = 'capturing';
    if (count > 0) {
      badgeEl.textContent = `${count} click${count === 1 ? '' : 's'} recorded`;
      badgeEl.className   = 'visible';
    }
    return;
  }

  if (count > 0) {
    statusEl.textContent = `${count} step${count === 1 ? '' : 's'} captured`;
    statusEl.className   = 'success';
    return;
  }

  statusEl.textContent = 'Click Start to begin recording.';
}

// ── Bootstrap: read current state ────────────────────────────────────────────

chrome.storage.local.get(['capturing', 'sending', 'events', 'guideId', 'guideTitle', 'lastError'], (data) => {
  render({
    capturing:  !!data.capturing,
    sending:    !!data.sending,
    events:     data.events || [],
    guideId:    data.guideId || null,
    guideTitle: data.guideTitle || null,
    error:      data.lastError || null,
  });
});

// ── Live updates via storage changes ─────────────────────────────────────────

chrome.storage.onChanged.addListener((_, area) => {
  if (area !== 'local') return;
  chrome.storage.local.get(['capturing', 'sending', 'events', 'guideId', 'guideTitle', 'lastError'], (data) => {
    render({
      capturing:  !!data.capturing,
      sending:    !!data.sending,
      events:     data.events || [],
      guideId:    data.guideId || null,
      guideTitle: data.guideTitle || null,
      error:      data.lastError || null,
    });
  });
});

// ── Start capture ─────────────────────────────────────────────────────────────

startBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // Clear previous guide result
  chrome.storage.local.remove(['guideId', 'guideTitle', 'lastError']);
  render({ capturing: true, sending: false, events: [], guideId: null, guideTitle: null, error: null });

  chrome.runtime.sendMessage({ action: 'startCapture', tabId: tab.id }, (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      chrome.storage.local.get(['capturing', 'events'], (data) => {
        render({ capturing: !!data.capturing, sending: false, events: data.events || [], guideId: null, guideTitle: null, error: null });
      });
    }
  });
});

// ── Stop capture ──────────────────────────────────────────────────────────────

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopCapture' });
  // UI updates via storage.onChanged
});
