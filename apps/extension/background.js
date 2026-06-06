chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({
    "liveseller:runtimeOrigin": "http://127.0.0.1:8787"
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "liveseller:viewer-message") {
    chrome.storage.session.set({
      "liveseller:lastViewerMessage": {
        viewerId: message.viewerId,
        viewerName: message.viewerName,
        text: message.text,
        capturedAt: new Date().toISOString(),
        source: "content-script"
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "liveseller:get-last-viewer-message") {
    chrome.storage.session.get("liveseller:lastViewerMessage").then(sendResponse);
    return true;
  }

  return false;
});
