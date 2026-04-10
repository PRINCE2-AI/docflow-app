// ── Content script (injected dynamically on Start) ───────────────────────────
// Guard: prevent double-registration if injected into the same tab again.
if (window.__docflowCaptureActive) {
  // Already running — reset the stop flag so it keeps listening
  window.__docflowCaptureActive = true;
} else {
  window.__docflowCaptureActive = true;

  // ── XPath generator ─────────────────────────────────────────────────────────
  function getXPath(el) {
    // Shortcut: unique id makes a perfect selector
    if (el.id) return `//*[@id="${el.id}"]`;

    const parts = [];
    let node = el;

    while (node && node.nodeType === Node.ELEMENT_NODE) {
      // Count preceding siblings with the same tag (1-based index)
      let index = 1;
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (sib.tagName === node.tagName) index++;
      }
      parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
      node = node.parentElement;
    }

    return '/' + parts.join('/');
  }

  // ── Best visible text for an element ────────────────────────────────────────
  function getElementText(el) {
    return (
      el.innerText ||
      el.value ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      el.tagName.toLowerCase()
    )
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 150);
  }

  // ── Click handler ────────────────────────────────────────────────────────────
  function onClick(e) {
    if (!window.__docflowCaptureActive) return;

    const el = e.target;
    const event = {
      element_text:  getElementText(el),
      element_xpath: getXPath(el),
      page_url:      location.href,
      timestamp:     Date.now(),
    };

    chrome.runtime.sendMessage({ action: 'recordClick', event }).catch(() => {
      // Extension may be reloading — ignore
    });
  }

  // Use capture phase so we catch clicks before any stopPropagation calls
  document.addEventListener('click', onClick, true);

  // ── Stop message from background ─────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'stopCapture') {
      window.__docflowCaptureActive = false;
      document.removeEventListener('click', onClick, true);
    }
  });
}
