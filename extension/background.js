// ── Background service worker ────────────────────────────────────────────────
// Owns all mutable state (capturing flag, events array, active tabId).
// Coordinates between popup and content script.

const API_URL = 'http://localhost:8000/api/guides/create';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {

    // ── startCapture ─────────────────────────────────────────────────────────
    case 'startCapture': {
      const tabId = msg.tabId;

      // Clear previous session state
      chrome.storage.local.set(
        { capturing: true, sending: false, tabId, events: [], guideId: null, guideTitle: null, lastError: null },
        () => {
          chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js'],
          })
          .then(() => sendResponse({ ok: true }))
          .catch((err) => {
            console.error('[DocFlow] Script injection failed:', err);
            chrome.storage.local.set({ capturing: false });
            sendResponse({ ok: false, error: err.message });
          });
        }
      );

      return true; // async sendResponse
    }

    // ── stopCapture ──────────────────────────────────────────────────────────
    case 'stopCapture': {
      chrome.storage.local.get(['tabId', 'events'], ({ tabId, events = [] }) => {
        // Signal content script to stop listening
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { action: 'stopCapture' })
            .catch(() => { /* tab may be gone */ });
        }

        chrome.storage.local.set({ capturing: false, tabId: null }, () => {
          sendResponse({ ok: true });

          // Fire-and-forget the API call
          if (events.length > 0) {
            sendToBackend(events);
          }
        });
      });

      return true;
    }

    // ── recordClick ──────────────────────────────────────────────────────────
    case 'recordClick': {
      chrome.storage.local.get(['capturing', 'tabId', 'events'], async ({ capturing, tabId, events = [] }) => {
        if (!capturing || !tabId) return;

        const step = {
          step_number:       events.length + 1,
          action:            'click',
          element_text:      msg.event.element_text,
          element_xpath:     msg.event.element_xpath,
          page_url:          msg.event.page_url,
          timestamp:         msg.event.timestamp,
          screenshot_base64: null,
        };

        // Brief delay so page can paint the result of the click
        await new Promise((r) => setTimeout(r, 300));

        try {
          const tab    = await chrome.tabs.get(tabId);
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          step.screenshot_base64 = dataUrl;
        } catch (err) {
          console.warn('[DocFlow] Screenshot failed:', err.message);
        }

        chrome.storage.local.get(['capturing', 'events'], ({ capturing: stillCapturing, events: latest = [] }) => {
          if (!stillCapturing) return;
          latest.push(step);
          chrome.storage.local.set({ events: latest });
        });
      });
      break;
    }
  }
});

// ── sendToBackend ─────────────────────────────────────────────────────────────
// Called after Stop. Sets sending=true, POSTs, stores result or error.

async function sendToBackend(steps) {
  chrome.storage.local.set({ sending: true, lastError: null });

  try {
    const response = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ steps }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server ${response.status}: ${text.slice(0, 120)}`);
    }

    const data = await response.json();

    chrome.storage.local.set({
      sending:    false,
      guideId:    data.guide_id,
      guideTitle: data.title || null,
    });
  } catch (err) {
    console.error('[DocFlow] Backend error:', err);
    chrome.storage.local.set({
      sending:   false,
      lastError: err.message,
    });
  }
}
