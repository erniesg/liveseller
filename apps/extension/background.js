chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  chrome.storage.session.set({
    "liveseller:runtimeOrigin": "http://127.0.0.1:8787"
  });
});

const SHOPEE_LIVE_SETUP_URL = "https://live.shopee.sg/pc/setup?from=seller_center";

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 10000);
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLowRiskSendReply(action) {
  return action &&
    typeof action.actionId === "string" &&
    action.type === "send_reply" &&
    action.risk === "low" &&
    action.requiresApproval === false &&
    action.payload?.kind === "send_reply" &&
    typeof action.payload.text === "string" &&
    action.payload.text.trim().length > 0;
}

function approvedCreateProductCommands(commands) {
  return Array.isArray(commands)
    ? commands.filter((command) =>
        command?.kind === "create_product" &&
        typeof command.commandId === "string" &&
        (command.approvalStatus === "approved" || command.approvalStatus === "edited")
      )
    : [];
}

async function findOrCreateShopeeLiveTab() {
  const tabs = await chrome.tabs.query({ url: "https://live.shopee.sg/pc/*" });
  const existing = tabs.find((tab) => tab.url?.includes("/pc/preview")) || tabs[0];
  if (existing?.id) {
    return existing;
  }
  return chrome.tabs.create({ url: SHOPEE_LIVE_SETUP_URL, active: true });
}

function inspectOrAdvanceShopeePreview() {
  function extractPreview() {
    const text = document.body?.innerText ?? "";
    const rtmpUrl = text.match(/rtmp:\/\/[^\s]+\/livestreaming\//u)?.[0];
    const rtmpKey = text.match(/sg-live-[^\s]+/u)?.[0];
    return {
      url: location.href,
      title: document.title,
      previewReady: Boolean(location.href.includes("/pc/preview") && rtmpUrl && rtmpKey),
      rtmpUrl,
      rtmpKey,
      rtmpUrlPresent: Boolean(rtmpUrl),
      rtmpKeyPresent: Boolean(rtmpKey),
      goLiveVisible: text.includes("Go Live"),
      commentsVisible: text.includes("Comments")
    };
  }

  const preview = extractPreview();
  if (preview.previewReady) {
    return { status: "preview_ready", ...preview };
  }

  const buttons = Array.from(document.querySelectorAll("button"));
  const next = buttons.find((button) => button.textContent?.trim().toUpperCase() === "NEXT");
  if (next) {
    next.click();
    return {
      status: "clicked_next",
      url: location.href,
      title: document.title,
      rtmpUrlPresent: false,
      rtmpKeyPresent: false
    };
  }

  return {
    status: "setup_not_ready",
    ...preview,
    rtmpUrl: undefined,
    rtmpKey: undefined
  };
}

async function prepareShopeeTestPreview() {
  const tab = await findOrCreateShopeeLiveTab();
  if (!tab.id) {
    throw new Error("Shopee Live tab was not available.");
  }
  if (!tab.url?.includes("live.shopee.sg/pc/")) {
    await chrome.tabs.update(tab.id, { url: SHOPEE_LIVE_SETUP_URL, active: true });
    await waitForTabLoad(tab.id);
  }

  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: inspectOrAdvanceShopeePreview
  });
  let value = result?.result;
  if (value?.status === "clicked_next") {
    await delay(5000);
    [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: inspectOrAdvanceShopeePreview
    });
    value = result?.result;
  }

  if (!value?.previewReady || !value.rtmpUrl || !value.rtmpKey) {
    return {
      ok: false,
      status: value?.status ?? "preview_not_ready",
      tabId: tab.id,
      previewUrl: value?.url ?? tab.url,
      rtmpUrlPresent: Boolean(value?.rtmpUrlPresent),
      rtmpKeyPresent: Boolean(value?.rtmpKeyPresent),
      goLiveVisible: Boolean(value?.goLiveVisible)
    };
  }

  await chrome.storage.session.set({
    "liveseller:shopeePreview": {
      tabId: tab.id,
      previewUrl: value.url,
      rtmpUrlPresent: true,
      rtmpKeyPresent: true,
      goLiveVisible: Boolean(value.goLiveVisible),
      capturedAt: new Date().toISOString()
    }
  });

  return {
    ok: true,
    tabId: tab.id,
    previewUrl: value.url,
    rtmpUrl: value.rtmpUrl,
    rtmpKey: value.rtmpKey,
    rtmpUrlPresent: true,
    rtmpKeyPresent: true,
    goLiveVisible: Boolean(value.goLiveVisible),
    commentsVisible: Boolean(value.commentsVisible)
  };
}

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

  if (message?.type === "liveseller:prepare-shopee-test-preview") {
    prepareShopeeTestPreview()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "liveseller:execute-seller-command") {
    if (!isLowRiskSendReply(message.action)) {
      sendResponse({ ok: false, error: "Only low-risk no-approval send_reply actions can execute." });
      return false;
    }
    chrome.storage.session.set({
      "liveseller:lastQueuedSellerReply": {
        actionId: message.action.actionId,
        text: message.action.payload.text,
        queuedAt: new Date().toISOString(),
        source: "side-panel"
      }
    });
    sendResponse({ ok: true, status: "queued_for_shopee_content_script", actionId: message.action.actionId });
    return false;
  }

  if (message?.type === "liveseller:queue-create-products") {
    const commands = approvedCreateProductCommands(message.commands);
    chrome.storage.session.set({
      "liveseller:queuedCreateProducts": {
        commands,
        queuedAt: new Date().toISOString(),
        source: "side-panel"
      }
    });
    sendResponse({ ok: commands.length > 0, status: "queued_for_authenticated_tab", commandCount: commands.length });
    return false;
  }

  return false;
});
