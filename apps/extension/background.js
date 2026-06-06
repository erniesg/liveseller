chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  chrome.storage.session.set({
    "liveseller:runtimeOrigin": "http://127.0.0.1:8787"
  });
});

const SHOPEE_LIVE_SETUP_URL = "https://live.shopee.sg/pc/setup?from=seller_center";
const SHOPEE_CREATE_PRODUCT_URL = "https://seller.shopee.sg/portal/product/new";

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

async function findOrCreateShopeeProductTab() {
  const tabs = await chrome.tabs.query({ url: "https://seller.shopee.sg/portal/product/*" });
  const existing = tabs.find((tab) => tab.url?.includes("/portal/product/new")) || tabs[0];
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    return existing;
  }
  const tab = await chrome.tabs.create({ url: SHOPEE_CREATE_PRODUCT_URL, active: true });
  if (tab.id) {
    await waitForTabLoad(tab.id);
  }
  return tab;
}

function clickButtonByText(labels) {
  const normalized = labels.map((label) => String(label).replace(/\s+/g, " ").trim().toLowerCase());
  const button = Array.from(document.querySelectorAll("button")).find((candidate) => {
    const text = String(candidate.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return normalized.some((label) => text === label || text.includes(label));
  });
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
    return false;
  }
  button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
  button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  button.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
  button.click();
  return true;
}

function fillShopeeCreateProductForm(command, options = {}) {
  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(element, String(value));
    } else {
      element.value = String(value);
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  function write(selectors, value) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && ("value" in element)) {
        setNativeValue(element, value);
        return selector;
      }
    }
    return undefined;
  }

  function fileFromDataUrl(image, index) {
    const [header, base64] = String(image.uri || "").split(",");
    if (!header?.startsWith("data:") || !base64) {
      return undefined;
    }
    const mime = header.match(/^data:([^;]+)/)?.[1] || "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
      bytes[byteIndex] = binary.charCodeAt(byteIndex);
    }
    return new File([bytes], image.alt || `liveseller-product-${index + 1}.jpg`, { type: mime });
  }

  function uploadImages(product) {
    const files = (product.media?.images || [])
      .map(fileFromDataUrl)
      .filter(Boolean)
      .slice(0, 9);
    if (files.length === 0) {
      return { selector: undefined, count: 0 };
    }
    const input = document.querySelector("input[type='file'][accept*='image'], input[type='file']");
    if (!(input instanceof HTMLInputElement)) {
      return { selector: undefined, count: 0 };
    }
    const transfer = new DataTransfer();
    for (const file of files) {
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { selector: "input[type='file']", count: files.length };
  }

  const product = command?.payload?.product;
  if (!product) {
    return { ok: false, error: "missing_product_payload" };
  }
  const uploadedImages = uploadImages(product);
  const filled = [
    write([
      "[name='product_name']",
      "[name='name']",
      "input[maxlength='120']",
      "input[placeholder*='Product Name' i]",
      "input[placeholder*='product name' i]",
      "input[placeholder*='Brand Name' i]",
      "input[placeholder*='Product Type' i]"
    ], product.title),
    write(["textarea[name='description']", "[name='description']", "textarea[placeholder*='description' i]"], product.description),
    write(["[name='price']", "input[placeholder*='price' i]"], product.price),
    write(["[name='stock']", "input[placeholder*='stock' i]"], product.stock),
    write(["[name='sku']", "input[placeholder*='sku' i]"], product.sku)
  ].filter(Boolean);
  return {
    ok: filled.length >= 3 || uploadedImages.count > 0,
    filled,
    uploadedImages,
    submitted: options.submit === true
      ? clickButtonByText(["Save and Publish", "Save and Delist", "Publish"])
      : false,
    title: document.title,
    url: location.href
  };
}

function confirmShopeeGoLiveClick() {
  const ok = clickButtonByText(["Go Live", "Start Live"]);
  return {
    ok,
    goLivePressed: ok,
    title: document.title,
    url: location.href
  };
}

function fillShopeeReplyComposer(action) {
  const text = action?.payload?.text;
  const composer = document.querySelector("[data-liveseller-composer], textarea[placeholder*='message' i], textarea, input[placeholder*='message' i]");
  if (!text || !composer || !("value" in composer)) {
    return { ok: false, error: "composer_not_found" };
  }
  if (String(composer.value || "").trim()) {
    return { ok: false, error: "seller_is_typing" };
  }
  composer.value = text;
  composer.dispatchEvent(new Event("input", { bubbles: true }));
  const send = document.querySelector("[data-liveseller-send], button[type='submit']");
  if (send instanceof HTMLButtonElement) {
    send.click();
  }
  return { ok: true, publicSend: true, title: document.title, url: location.href };
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
    findOrCreateShopeeLiveTab()
      .then((tab) => chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillShopeeReplyComposer,
        args: [message.action]
      }))
      .then(([result]) => sendResponse({
        ok: Boolean(result?.result?.ok),
        status: result?.result?.ok ? "executed_in_authenticated_shopee_tab" : "queued_for_shopee_content_script",
        actionId: message.action.actionId,
        evidence: result?.result
      }))
      .catch((error) => sendResponse({
        ok: false,
        status: "queued_for_shopee_content_script",
        actionId: message.action.actionId,
        error: error.message
      }));
    return true;
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
    if (commands.length === 0) {
      sendResponse({ ok: false, status: "no_approved_create_product_commands", commandCount: 0 });
      return false;
    }
    findOrCreateShopeeProductTab()
      .then((tab) => chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillShopeeCreateProductForm,
        args: [commands[0], { submit: false }]
      }))
      .then(([result]) => sendResponse({
        ok: Boolean(result?.result?.ok),
        status: result?.result?.ok ? "filled_authenticated_shopee_product_form" : "queued_for_authenticated_tab",
        commandCount: commands.length,
        evidence: result?.result
      }))
      .catch((error) => sendResponse({
        ok: false,
        status: "queued_for_authenticated_tab",
        commandCount: commands.length,
        error: error.message
      }));
    return true;
  }

  if (message?.type === "liveseller:confirm-product-publish") {
    const commands = approvedCreateProductCommands(message.commands);
    if (commands.length === 0) {
      sendResponse({ ok: false, status: "no_approved_create_product_commands", commandCount: 0 });
      return false;
    }
    findOrCreateShopeeProductTab()
      .then((tab) => chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillShopeeCreateProductForm,
        args: [commands[0], { submit: true }]
      }))
      .then(([result]) => sendResponse({
        ok: Boolean(result?.result?.ok && result?.result?.submitted),
        status: result?.result?.submitted ? "submitted_authenticated_shopee_product_form" : "product_form_submit_not_available",
        commandCount: commands.length,
        evidence: result?.result
      }))
      .catch((error) => sendResponse({
        ok: false,
        status: "product_form_submit_failed",
        commandCount: commands.length,
        error: error.message
      }));
    return true;
  }

  if (message?.type === "liveseller:confirm-go-live") {
    findOrCreateShopeeLiveTab()
      .then((tab) => chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: confirmShopeeGoLiveClick
      }))
      .then(([result]) => sendResponse({
        ok: Boolean(result?.result?.ok),
        status: result?.result?.ok ? "confirmed_go_live_clicked" : "go_live_button_not_available",
        evidence: result?.result
      }))
      .catch((error) => sendResponse({
        ok: false,
        status: "go_live_click_failed",
        error: error.message
      }));
    return true;
  }

  return false;
});
