function captureViewerRow(row) {
  const viewerId = row.getAttribute("data-viewer-id") || row.dataset.viewerId;
  const viewerName = row.getAttribute("data-viewer-name") || row.dataset.viewerName || viewerId;
  const text = row.textContent?.trim();
  if (!viewerId || !viewerName || !text) {
    return;
  }

  chrome.runtime.sendMessage({
    type: "liveseller:viewer-message",
    viewerId,
    viewerName,
    text
  });
}

function scanViewerRows() {
  document.querySelectorAll("[data-viewer-id][data-viewer-name]").forEach(captureViewerRow);
}

globalThis.addEventListener("message", (event) => {
  if (event.source !== globalThis || event.data?.type !== "liveseller:test-viewer-message") {
    return;
  }
  chrome.runtime.sendMessage({
    type: "liveseller:viewer-message",
    viewerId: event.data.viewerId || "test-viewer",
    viewerName: event.data.viewerName || "Test Viewer",
    text: event.data.text || ""
  });
});

scanViewerRows();
setInterval(scanViewerRows, 2000);
