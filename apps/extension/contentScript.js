(() => {
  if (globalThis.__livesellerShopeeContentScript) return;
  globalThis.__livesellerShopeeContentScript = true;

  const seen = new Set();

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sendViewerMessage(message) {
    const text = normalizeText(message.text);
    if (!text) return;
    const viewerId = normalizeText(message.viewerId) || normalizeText(message.viewerName) || "shopee-viewer";
    const viewerName = normalizeText(message.viewerName) || viewerId;
    const key = `${viewerId}:${viewerName}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    chrome.runtime.sendMessage({
      type: "liveseller:viewer-message",
      viewerId,
      viewerName,
      text,
      isHost: Boolean(message.isHost),
      source: message.source || "shopee-content-script"
    });
  }

  function parseShopeePayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    let content = raw.content;
    if (typeof content === "string") {
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object") content = parsed;
      } catch {
        // Some Shopee payloads use content as the plain text.
      }
    }
    const text = normalizeText(
      typeof content === "object" && content
        ? content.content || content.content_v2 || content.text
        : content
    );
    if (!text) return null;
    const viewerId = raw.uid == null ? raw.id : raw.uid;
    return {
      viewerId: viewerId == null ? raw.nickname || raw.display_name || raw.username : String(viewerId),
      viewerName: raw.display_name || raw.nickname || raw.username || (viewerId == null ? "Shopee Viewer" : String(viewerId)),
      text,
      source: "receiveNormalUserMessage"
    };
  }

  function captureViewerRow(row) {
    const fakeViewerId = row.getAttribute("data-viewer-id") || row.dataset.viewerId;
    const fakeViewerName = row.getAttribute("data-viewer-name") || row.dataset.viewerName || fakeViewerId;
    if (fakeViewerId && fakeViewerName) {
      sendViewerMessage({
        viewerId: fakeViewerId,
        viewerName: fakeViewerName,
        text: row.textContent,
        source: "data-viewer-row"
      });
      return;
    }

    const item = row.querySelector("[class*='item_']") || row;
    const className = String(item.className || "");
    const text = row.querySelector(".message-content_3bb92")?.textContent || "";
    const viewerName = row.querySelector(".user-name_2fad3")?.textContent || "";
    const isHost = className.includes("host-item") || Boolean(row.querySelector(".host-icon_3f8fa"));
    const isSystem = !viewerName ||
      className.includes("highlight-item") ||
      /joined!|Welcome to Shopee Live/i.test(text);
    if (isSystem) return;
    sendViewerMessage({
      viewerId: viewerName || "shopee-viewer",
      viewerName: viewerName || "Shopee Viewer",
      text,
      isHost,
      source: "shopee-dom-row"
    });
  }

  function scanViewerRows() {
    document.querySelectorAll("[data-viewer-id][data-viewer-name], .comment-container_7ca29")
      .forEach(captureViewerRow);
  }

  function installConsoleHook() {
    if (globalThis.__livesellerConsoleHook) return;
    const originalLog = console.log;
    console.log = function livesellerConsoleLog(...args) {
      try {
        if (typeof args[0] === "string" && args[0].startsWith("receiveNormalUserMessage") && args[1]) {
          const parsed = parseShopeePayload(args[1]);
          if (parsed) sendViewerMessage(parsed);
        }
      } catch {
        // Never break Shopee logging.
      }
      return originalLog.apply(this, args);
    };
    globalThis.__livesellerConsoleHook = true;
  }

  globalThis.addEventListener("message", (event) => {
    if (event.source !== globalThis || event.data?.type !== "liveseller:test-viewer-message") {
      return;
    }
    sendViewerMessage({
      viewerId: event.data.viewerId || "test-viewer",
      viewerName: event.data.viewerName || "Test Viewer",
      text: event.data.text || "",
      source: "test-message"
    });
  });

  installConsoleHook();
  scanViewerRows();
  setInterval(scanViewerRows, 1200);
})();
