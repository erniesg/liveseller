chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  chrome.storage.session.set({
    "liveseller:runtimeOrigin": "http://127.0.0.1:8787"
  });
});

const SHOPEE_LIVE_SETUP_URL = "https://live.shopee.sg/pc/setup?from=seller_center";
const SHOPEE_LIVE_PREVIEW_URL = "https://live.shopee.sg/pc/preview?session=1431887";
const SHOPEE_CREATE_PRODUCT_URL = "https://seller.shopee.sg/portal/product/new";
let productAutomationInFlight = false;
const AUTO_REPLY_SESSION_ID = "live-vintage-jewelry-001";
const AUTO_REPLY_ALLOW_HOST_TEST = false;
let liveCommentMonitorInFlight = false;
const liveCommentMonitorPrimedTabs = new Set();
const autoReplySeenMessages = new Set();
const autoReplySentTexts = new Set();

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
        (command.approvalStatus === "approved" || command.approvalStatus === "edited") &&
        command.payload?.product
      )
    : [];
}

function createProductImageEvidence(command) {
  const images = command?.payload?.product?.media?.images || [];
  const first = images[0];
  const uri = String(first?.uri || first?.dataUrl || first?.url || first?.src || "");
  return {
    imageCount: images.length,
    firstImageIsDataUrl: uri.startsWith("data:image/"),
    firstImageIsGenerated: /generated|clean background|background/i.test(`${first?.id || ""} ${first?.alt || ""}`),
    firstImageBytes: uri.startsWith("data:image/") ? uri.length : 0,
    firstImageLabel: first?.alt || first?.id || ""
  };
}

async function findOrCreateShopeeLiveTab() {
  const tabs = await chrome.tabs.query({ url: "https://live.shopee.sg/pc/*" });
  const existing = tabs.find((tab) => tab.url?.includes("/pc/live")) ||
    tabs.find((tab) => tab.url?.includes("/pc/preview?session=1431887")) ||
    tabs.find((tab) => tab.url?.includes("/pc/preview")) ||
    tabs[0];
  if (existing?.id) {
    return existing;
  }
  return chrome.tabs.create({ url: SHOPEE_LIVE_PREVIEW_URL, active: true });
}

function scanShopeeLiveComments() {
  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function rowMessage(row) {
    const item = row.querySelector("[class*='item_']") || row;
    const className = String(item.className || "");
    const rowText = normalizeText(row.textContent || "");
    const text = normalizeText(row.querySelector("[class*='message-content_']")?.textContent || "");
    const viewerName = normalizeText(row.querySelector("[class*='user-name_']")?.textContent || "");
    const host = Boolean(row.querySelector("[class*='host-icon_']")) || /host-item/i.test(className);
    const commentId = normalizeText(row.parentElement?.getAttribute("data-comment-id") || row.getAttribute("data-comment-id") || "");
    const uid = normalizeText(row.parentElement?.getAttribute("data-uid") || row.getAttribute("data-uid") || "");
    const isSystem = !text ||
      !viewerName ||
      /joined!?|followed the host|shared the live|liked|Welcome to Shopee Live/i.test(`${text} ${rowText}`) ||
      /highlight-item|notice|announce|system/i.test(className);
    if (isSystem) {
      return undefined;
    }
    return {
      viewerId: uid || viewerName || "shopee-viewer",
      viewerName: viewerName || "Shopee Viewer",
      text,
      isHost: host,
      source: "shopee-live-dom-monitor",
      commentId
    };
  }
  return Array.from(document.querySelectorAll("[class*='comment-container_']"))
    .map(rowMessage)
    .filter(Boolean)
    .slice(-20);
}

async function findExistingShopeeProductCreationTab(storedTabId) {
  if (storedTabId) {
    try {
      const stored = await chrome.tabs.get(storedTabId);
      if (stored?.id && String(stored.url || "").includes("/portal/product/new")) {
        return stored;
      }
    } catch {
      await chrome.storage.session.remove("liveseller:productCreationTabId");
    }
  }
  const productTabs = await chrome.tabs.query({ url: "https://seller.shopee.sg/portal/product/new*" });
  return productTabs.find((tab) => tab.active) || productTabs.at(-1) || productTabs[0];
}

async function ensureShopeeProductCreationTabReady(tab) {
  if (!tab?.id) {
    throw new Error("Shopee product creation tab was not available.");
  }
  await delay(1200);
  let current = await chrome.tabs.get(tab.id).catch(() => tab);
  let currentUrl = String(current?.url || tab.url || "");
  if (currentUrl.includes("edu/home") || !currentUrl.includes("/portal/product/new")) {
    const productTabs = await chrome.tabs.query({ url: "https://seller.shopee.sg/portal/product/new*" });
    const productTab = productTabs.find((candidate) => candidate.active) || productTabs.at(-1) || productTabs[0];
    if (productTab?.id) {
      await chrome.storage.session.set({ "liveseller:productCreationTabId": productTab.id });
      return productTab;
    }
    const updated = await chrome.tabs.update(tab.id, { url: SHOPEE_CREATE_PRODUCT_URL, active: true });
    await waitForTabLoad(tab.id);
    await delay(1800);
    current = await chrome.tabs.get(tab.id).catch(() => updated || tab);
    currentUrl = String(current?.url || "");
  }
  if (currentUrl.includes("edu/home") || !currentUrl.includes("/portal/product/new")) {
    return {
      ...current,
      livesellerProductTabNotReady: true,
      livesellerProductTabUrl: currentUrl
    };
  }
  await chrome.storage.session.set({ "liveseller:productCreationTabId": current.id });
  return current;
}

async function findOrCreateShopeeProductTab(options = {}) {
  const resetToNewProduct = options.resetToNewProduct !== false;
  const stored = await chrome.storage.session.get("liveseller:productCreationTabId");
  // Keep the create product tab isolated from livestream monitoring and other Shopee seller pages.
  const existing = await findExistingShopeeProductCreationTab(stored["liveseller:productCreationTabId"]);
  if (existing?.id) {
    await chrome.storage.session.set({ "liveseller:productCreationTabId": existing.id });
    if (resetToNewProduct) {
      const updated = await chrome.tabs.update(existing.id, { url: SHOPEE_CREATE_PRODUCT_URL, active: true });
      await waitForTabLoad(existing.id);
      return ensureShopeeProductCreationTabReady(updated || { ...existing, url: SHOPEE_CREATE_PRODUCT_URL });
    }
    const updated = await chrome.tabs.update(existing.id, { active: true });
    return ensureShopeeProductCreationTabReady(updated || existing);
  }
  const tab = await chrome.tabs.create({ url: SHOPEE_CREATE_PRODUCT_URL, active: true });
  if (tab.id) {
    await chrome.storage.session.set({ "liveseller:productCreationTabId": tab.id });
    await waitForTabLoad(tab.id);
  }
  return ensureShopeeProductCreationTabReady(tab);
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

function clickShopeeProductSection(labels) {
  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
  const normalized = labels.map((label) => String(label).replace(/\s+/g, " ").trim().toLowerCase());
  const target = Array.from(document.querySelectorAll("button, a, div, span")).find((candidate) => {
    const text = String(candidate.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return visible(candidate) &&
      text.length > 0 &&
      text.length <= 80 &&
      normalized.some((label) => text === label || text.includes(label));
  });
  if (!target) {
    return { ok: false, section: labels[0] };
  }
  target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
  target.click();
  return { ok: true, section: labels[0], title: document.title, url: location.href };
}

async function fillShopeeCreateProductForm(command, options = {}) {
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    element.focus?.();
    if (descriptor?.set) {
      descriptor.set.call(element, String(value));
    } else {
      element.value = String(value);
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    element.blur?.();
  }

  function confirmImageEditorSaveInPage() {
    const dialog = Array.from(document.querySelectorAll("[role='dialog'], .eds-modal, .shopee-modal, .modal, .eds-dialog"))
      .find((element) => {
        const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
        return visible(element) && /Edit Product Images|Rotate right|Flip horizontal|Preview/.test(text);
      });
    if (!dialog) {
      return { ok: false, skipped: "image_editor_not_open" };
    }
    const save = Array.from(dialog.querySelectorAll("button"))
      .find((button) => {
        const text = String(button.textContent || "").replace(/\s+/g, " ").trim();
        return visible(button) && /^Save$/i.test(text) && !button.disabled;
      });
    if (!save) {
      return {
        ok: false,
        skipped: "image_editor_save_not_available",
        dialogText: String(dialog.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)
      };
    }
    save.click();
    return { ok: true, clicked: "image_editor_save" };
  }

  function write(selectors, value) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.isContentEditable) {
        element.focus?.();
        element.textContent = String(value);
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return selector;
      }
      if (element && ("value" in element)) {
        setNativeValue(element, value);
        return selector;
      }
    }
    return undefined;
  }

  function clickElement(element) {
    element.scrollIntoView?.({ block: "center", inline: "center" });
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
    element.click?.();
  }

  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function findTextElement(labels) {
    const normalized = labels.map((label) => String(label).replace(/\s+/g, " ").trim().toLowerCase());
    return Array.from(document.querySelectorAll("label, div, span, p")).find((element) => {
      const text = String(element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return visible(element) &&
        text.length > 0 &&
        text.length <= 80 &&
        normalized.some((label) => text === label || text.includes(label));
    });
  }

  function findSectionByText(labels) {
    const label = findTextElement(labels);
    if (!label) {
      return undefined;
    }
    let current = label;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const fields = current.querySelectorAll?.("input:not([type='hidden']):not([type='file']), textarea, [contenteditable='true']");
      if (fields?.length) {
        return current;
      }
      current = current.parentElement;
    }
    return label.parentElement || label;
  }

  function writeNearLabel(labels, value, fieldName, selectors = "input, textarea, [contenteditable='true']") {
    const label = findTextElement(labels);
    const section = label ? findSectionByText(labels) : undefined;
    if (!section) {
      return undefined;
    }
    const candidates = Array.from(section.querySelectorAll(selectors))
      .filter((element) =>
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element.isContentEditable
      )
      .filter((element) => {
        if (element instanceof HTMLInputElement && ["hidden", "file", "radio", "checkbox"].includes(element.type)) {
          return false;
        }
        return true;
      });
    const target = candidates.find((element) => visible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true");
    if (!target) {
      return undefined;
    }
    const rankedTargets = candidates
      .filter((element) => visible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true")
      .map((element) => {
        const labelRect = label?.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const verticalDistance = labelRect ? Math.abs(rect.top - labelRect.top) : 0;
        const horizontalPenalty = labelRect && rect.left < labelRect.left ? 100 : 0;
        return { element, score: verticalDistance + horizontalPenalty };
      })
      .sort((left, right) => left.score - right.score);
    const nearestTarget = rankedTargets[0]?.element || target;
    if (nearestTarget.isContentEditable) {
      nearestTarget.textContent = String(value);
      nearestTarget.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
      nearestTarget.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      setNativeValue(nearestTarget, value);
    }
    return fieldName;
  }

  function writeVisibleByPlaceholder(placeholders, value, fieldName) {
    const normalized = placeholders.map((placeholder) => String(placeholder).toLowerCase());
    const target = Array.from(document.querySelectorAll("input")).find((element) => {
      const placeholder = String(element.getAttribute("placeholder") || "").toLowerCase();
      return visible(element) &&
        !element.disabled &&
        element.getAttribute("aria-disabled") !== "true" &&
        normalized.some((label) => placeholder.includes(label));
    });
    if (!target) {
      return undefined;
    }
    setNativeValue(target, value);
    return fieldName;
  }

  function enableFirstShippingOption() {
    const shippingSection = findSectionByText(["shipping fee", "doorstep delivery", "standard"]);
    const candidates = [
      ...(shippingSection ? Array.from(shippingSection.querySelectorAll("input[type='checkbox'], button, [role='switch'], [aria-checked], [class*='switch'], [class*='toggle']")) : []),
      ...Array.from(document.querySelectorAll("input[type='checkbox'], button[aria-checked], [role='switch'], [aria-checked], [class*='switch'], [class*='toggle']"))
    ];
    function rowText(element) {
      const row = element.closest("[class*='row'], [class*='item'], [class*='option'], [class*='logistic'], [class*='delivery'], li, tr, section, div") || element;
      return String(`${row.textContent || ""} ${element.textContent || ""} ${element.getAttribute("aria-label") || ""}`)
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }
    function isEnabled(element) {
      return element.checked === true ||
        element.getAttribute("aria-checked") === "true" ||
        element.classList?.toString().toLowerCase().includes("checked") ||
        element.classList?.toString().toLowerCase().includes("open") ||
        element.classList?.toString().toLowerCase().includes("active");
    }
    const ranked = candidates
      .filter((element) => {
        const text = rowText(element);
        const checked = isEnabled(element);
        return visible(element) &&
          !element.disabled &&
          element.getAttribute("aria-disabled") !== "true" &&
          !checked &&
          !text.includes("save") &&
          !text.includes("cancel") &&
          !text.includes("buyer self-collection") &&
          !text.includes("pick lockers") &&
          !text.includes("spx express lockers") &&
          !text.includes("collection points");
      })
      .map((element) => {
        const text = rowText(element);
        let score = 0;
        if (text.includes("standard")) score += 10;
        if (text.includes("doorstep delivery")) score += 10;
        if (text.includes("shopee supported logistics")) score += 4;
        if (text.includes("weight required")) score += 2;
        return { element, text, score };
      })
      .sort((left, right) => right.score - left.score);
    const target = ranked[0]?.element;
    if (!target) {
      const enabled = candidates.find((element) => visible(element) && isEnabled(element));
      if (enabled) {
        return "shippingOption";
      }
      return undefined;
    }
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
    target.click();
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return "shippingOption";
  }

  function existingImageUploadStatus() {
    const loading = imageUploadLoadingIndicators();
    return {
      imageCount: countVisibleUploadedImageTiles(),
      loadingCount: loading.spinnerCount,
      loading: loading.textLoading || loading.spinnerCount > 0
    };
  }

  function shouldSkipProductImageUpload(target) {
    const status = existingImageUploadStatus();
    if (target === "product_image" && (status.imageCount > 0 || status.loading)) {
      return { skipped: status.imageCount > 0 ? "product_image_already_present" : "product_image_upload_in_progress", ...status };
    }
    if (target === "promotion_image" && status.loading) {
      return { skipped: "image_upload_in_progress", ...status };
    }
    return undefined;
  }

  async function imageDataUrl(image) {
    const candidates = [
      image?.uri,
      image?.dataUrl,
      image?.url,
      image?.src
    ];
    const direct = candidates.find((candidate) => typeof candidate === "string" && candidate.startsWith("data:image/"));
    if (direct) {
      return direct;
    }
    const fetchable = candidates.find((candidate) =>
      typeof candidate === "string" &&
      (/^blob:/i.test(candidate) || /^https?:\/\//i.test(candidate) || candidate.startsWith("/"))
    );
    if (!fetchable || typeof fetch !== "function" || typeof FileReader !== "function") {
      return undefined;
    }
    try {
      const url = fetchable.startsWith("/") ? new URL(fetchable, location.origin).toString() : fetchable;
      const response = await fetch(url);
      if (!response.ok) {
        return undefined;
      }
      const blob = await response.blob();
      if (!String(blob.type || "").startsWith("image/")) {
        return undefined;
      }
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }

  function fileNameForImage(image, index, mime) {
    const extension = mime.includes("png")
      ? "png"
      : mime.includes("webp")
        ? "webp"
        : "jpg";
    const raw = String(image?.alt || image?.id || `liveseller-product-${index + 1}`)
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || `liveseller-product-${index + 1}`;
    return /\.[a-z0-9]{3,4}$/i.test(raw) ? raw : `${raw}.${extension}`;
  }

  async function fileFromImage(image, index) {
    const dataUrl = await imageDataUrl(image);
    const [header, base64] = String(dataUrl || "").split(",");
    if (!header?.startsWith("data:") || !base64) {
      return undefined;
    }
    const mime = header.match(/^data:([^;]+)/)?.[1] || "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
      bytes[byteIndex] = binary.charCodeAt(byteIndex);
    }
    return new File([bytes], fileNameForImage(image, index, mime), { type: mime });
  }

  function countVisibleUploadedImageTiles() {
    return Array.from(document.querySelectorAll("img, [style*='background-image'], .eds-upload__item, .shopee-image-manager__item, [class*='image-item'], [class*='upload-item']"))
      .filter((element) => {
        if (!visible(element)) {
          return false;
        }
        const context = String(element.closest(".eds-upload, .shopee-image-manager, [class*='upload'], [class*='image-manager'], [class*='image-item'], [class*='product-image'], [class*='promotion-image']")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        const className = String(element.className || element.closest("[class]")?.className || "").toLowerCase();
        if (!context && !/upload|image-manager|image-item|product-image|promotion-image/.test(className)) {
          return false;
        }
        const text = String(element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        const src = element instanceof HTMLImageElement ? String(element.currentSrc || element.src || "") : "";
        const style = String(element.getAttribute("style") || "");
        return Boolean(src || /background-image:\s*url\(/i.test(style)) &&
          !text.includes("add image") &&
          !text.includes("add video");
      }).length;
  }

  function imageUploadLoadingIndicators() {
    const bodyText = String(document.body?.textContent || "").replace(/\s+/g, " ");
    const spinnerElements = Array.from(document.querySelectorAll(
      "[class*='loading'], [class*='spinner'], [class*='progress'], [class*='uploading'], .eds-loading, .eds-spinner"
    )).filter(visible);
    return {
      textLoading: /Uploading|Processing|Loading/i.test(bodyText),
      spinnerCount: spinnerElements.length
    };
  }

  async function waitForImageUploadEvidence(options = {}) {
    const previousVisibleTiles = Number(options.previousVisibleTiles || 0);
    const requireCompletedTile = options.requireCompletedTile === true;
    for (let attempt = 1; attempt <= 36; attempt += 1) {
      const editorText = String(document.body?.textContent || "").replace(/\s+/g, " ");
      const editorOpen = /Edit Product Images|Rotate right|Flip horizontal|Preview/.test(editorText);
      const visibleTiles = countVisibleUploadedImageTiles();
      const loading = imageUploadLoadingIndicators();
      if (visibleTiles > previousVisibleTiles || (!requireCompletedTile && (visibleTiles > 0 || editorOpen))) {
        return {
          uploadedVisible: visibleTiles > previousVisibleTiles || visibleTiles > 0,
          editorOpen,
          loading: loading.textLoading || loading.spinnerCount > 0,
          spinnerCount: loading.spinnerCount,
          waitAttempt: attempt
        };
      }
      await delay(500);
    }
    const finalLoading = imageUploadLoadingIndicators();
    return {
      uploadedVisible: countVisibleUploadedImageTiles() > previousVisibleTiles,
      editorOpen: /Edit Product Images|Rotate right|Flip horizontal|Preview/.test(String(document.body?.textContent || "")),
      loading: finalLoading.textLoading || finalLoading.spinnerCount > 0,
      spinnerCount: finalLoading.spinnerCount,
      waitAttempt: 36
    };
  }

  async function uploadImages(product) {
    const images = product.media?.images || [];
    const resolvedDataUrls = [];
    const files = [];
    for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
      const dataUrl = await imageDataUrl(images[imageIndex]);
      if (dataUrl) {
        resolvedDataUrls.push(dataUrl);
        const file = await fileFromImage({ ...images[imageIndex], uri: dataUrl }, imageIndex);
        if (file) {
          files.push(file);
        }
      }
    }
    const selectedFiles = files
      .filter(Boolean)
      .slice(0, 1);
    if (selectedFiles.length === 0) {
      const diagnostic = {
        selector: undefined,
        count: 0,
        diagnostic: "no_image_data_url",
        mediaImageCount: images.length,
        dataUrlCount: resolvedDataUrls.length
      };
      window.__livesellerLastShopeeImageUpload = diagnostic;
      return diagnostic;
    }
    const inputs = Array.from(document.querySelectorAll("input[type='file'][accept*='image'], input[type='file']"))
      .filter((input) => input instanceof HTMLInputElement)
      .filter((input) => {
        const accept = String(input.getAttribute("accept") || "").toLowerCase();
        const context = String(input.closest(".product-basic-info, .edit-row, .eds-upload, .image-manager-wrapper, form, section, div")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        return (accept === "" || accept.includes("image") || accept.includes(".jpg") || accept.includes(".jpeg") || accept.includes(".png")) &&
          !accept.includes("video") &&
          !context.includes("add video");
      });
    if (inputs.length === 0) {
      const diagnostic = {
        selector: undefined,
        count: 0,
        diagnostic: "no_image_file_input",
        mediaImageCount: images.length,
        dataUrlCount: resolvedDataUrls.length
      };
      window.__livesellerLastShopeeImageUpload = diagnostic;
      return diagnostic;
    }
    function inputContext(input) {
      const chunks = [];
      let node = input;
      for (let depth = 0; depth < 5 && node; depth += 1) {
        chunks.push(String(node.textContent || ""));
        const previous = node.previousElementSibling;
        if (previous) {
          chunks.push(String(previous.textContent || ""));
        }
        node = node.parentElement;
      }
      return chunks.join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    const rankedInputs = inputs
      .map((input) => {
        const context = inputContext(input);
        const accept = String(input.getAttribute("accept") || "").toLowerCase();
        let score = 0;
        if (accept.includes("image") || accept.includes(".jpg") || accept.includes(".png")) score += 4;
        if (context.includes("add image") || context.includes("product image") || context.includes("upload image")) score += 6;
        if (context.includes("basic information") || context.includes("product basic")) score += 3;
        if (context.includes("promotion image")) score -= 8;
        if (context.includes("image creator")) score -= 6;
        if (context.includes("local upload")) score -= 2;
        return { input, context, accept, score };
      })
      .sort((left, right) => right.score - left.score);
    const productImageInput = rankedInputs.find(({ context, accept }) => {
      return accept.includes("image") &&
        context.includes("add image") &&
        !context.includes("promotion image") &&
        !context.includes("add video") &&
        !context.includes("image creator");
    })?.input || rankedInputs.find(({ context }) => !context.includes("promotion image"))?.input || rankedInputs[0]?.input;
    const promotionImageInput = rankedInputs.find(({ input, context, accept }) => {
      return input !== productImageInput &&
        accept.includes("image") &&
        context.includes("promotion image") &&
        !context.includes("add video") &&
        !context.includes("image creator");
    })?.input;
    if (!productImageInput) {
      const diagnostic = {
        selector: undefined,
        count: 0,
        diagnostic: "no_product_image_input",
        mediaImageCount: images.length,
        dataUrlCount: resolvedDataUrls.length,
        attemptedInputs: rankedInputs.map(({ accept, context, score }) => ({ accept, context: context.slice(0, 120), score }))
      };
      window.__livesellerLastShopeeImageUpload = diagnostic;
      return diagnostic;
    }

    async function uploadToInput(input, target) {
      const existing = shouldSkipProductImageUpload(target);
      if (existing) {
        return {
          target,
          count: existing.imageCount > 0 ? 1 : 0,
          uploadedVisible: existing.imageCount > 0,
          loading: existing.loading,
          spinnerCount: existing.loadingCount,
          skipped: existing.skipped
        };
      }
      const transfer = new DataTransfer();
      for (const file of selectedFiles) {
        transfer.items.add(file);
      }
      const beforeTiles = countVisibleUploadedImageTiles();
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      let uploadEvidence = await waitForImageUploadEvidence({ previousVisibleTiles: beforeTiles });
      if (uploadEvidence.editorOpen) {
        const saveResult = confirmImageEditorSaveInPage();
        await delay(saveResult.ok ? 1400 : 600);
        uploadEvidence = {
          ...uploadEvidence,
          editorSave: saveResult,
          ...(await waitForImageUploadEvidence({ previousVisibleTiles: beforeTiles, requireCompletedTile: true }))
        };
      }
      return {
        target,
        count: uploadEvidence.uploadedVisible ? 1 : 0,
        ...uploadEvidence
      };
    }

    const targetUploads = [];
    targetUploads.push(await uploadToInput(productImageInput, "product_image"));
    if (promotionImageInput) {
      targetUploads.push(await uploadToInput(promotionImageInput, "promotion_image"));
    }
    const completedUploads = targetUploads.filter((target) => target.count > 0);
    const uploadEvidence = targetUploads.at(-1) || {};
    const evidence = {
      selector: "input[type='file'][accept*='image'], input[type='file']",
      count: completedUploads.reduce((total, target) => total + target.count, 0),
      fileNames: selectedFiles.map((file) => file.name),
      targets: targetUploads.length,
      targetUploads,
      promotionImageAttempted: Boolean(promotionImageInput),
      mediaImageCount: images.length,
      dataUrlCount: resolvedDataUrls.length,
      ...uploadEvidence,
      diagnostic: completedUploads.length > 0 ? undefined : "image_upload_not_visible",
      attemptedInputs: rankedInputs.map(({ accept, context, score }) => ({ accept, context: context.slice(0, 120), score })).slice(0, 5)
    };
    window.__livesellerLastShopeeImageUpload = evidence;
    return evidence;
  }

  const product = command?.payload?.product;
  if (!product) {
    return { ok: false, error: "missing_product_payload" };
  }
  const section = options.section || "basic";
  let uploadedImages = { selector: undefined, count: 0, skipped: "not_basic_section" };
  const filled = [];

  if (section === "basic") {
    filled.push(
      write([
        "[name='product_name']",
        "[name='name']",
        "input[placeholder*='Product Name' i]",
        "input[placeholder*='product name' i]",
        "input[placeholder*='Brand Name' i]",
        "input[placeholder*='Product Type' i]"
      ], product.title)
        || writeNearLabel(["product name"], product.title, "title", "input")
        || write(["input[maxlength='120']"], product.title),
      write([
        ".product-description-panel .ql-editor",
        ".product-description .ql-editor",
        "textarea[name='description']",
        "[name='description']",
        "textarea[placeholder*='description' i]"
      ], product.description)
        || writeNearLabel(["product description", "description"], product.description, "description", "textarea, [contenteditable='true']"),
      write(["[name='sku']", "input[placeholder*='sku' i]"], product.sku)
    );
    uploadedImages = options.submit !== true && options.skipImages !== true
      ? await uploadImages(product)
      : { selector: undefined, count: 0, skipped: "basic_image_upload_skipped" };
  }

  if (section === "sales") {
    filled.push(
      write(["[name='price']", "input[placeholder*='price' i]"], product.price)
        || writeNearLabel(["price"], product.price, "price", "input"),
      write(["[name='stock']", "input[placeholder*='stock' i]"], product.stock)
        || writeNearLabel(["stock"], product.stock, "stock", "input")
    );
  }

  if (section === "shipping") {
    filled.push(
      write(["[name='weight']", "input[placeholder*='weight' i]"], product.dimensions?.weightGrams ? product.dimensions.weightGrams / 1000 : 0.2)
        || writeVisibleByPlaceholder(["weight"], product.dimensions?.weightGrams ? product.dimensions.weightGrams / 1000 : 0.2, "weight"),
      writeVisibleByPlaceholder(["w (integer)", "width"], product.dimensions?.widthCm || 10, "parcelWidth"),
      writeVisibleByPlaceholder(["length", "l (integer)"], product.dimensions?.lengthCm || 10, "parcelLength"),
      writeVisibleByPlaceholder(["h (integer)", "height"], product.dimensions?.heightCm || 5, "parcelHeight"),
      enableFirstShippingOption()
    );
  }

  const filteredFilled = filled.filter(Boolean);
  return {
    ok: filteredFilled.length > 0 || uploadedImages.count > 0,
    filled: filteredFilled,
    uploadedImages,
    submitted: options.submit === true
      ? clickButtonByText(["Save and Publish", "Save and Delist", "Publish"])
      : false,
    title: document.title,
    url: location.href
  };
}

function confirmShopeeImageEditorSave() {
  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
  function textOf(element) {
    return String(element.textContent || "").replace(/\s+/g, " ").trim();
  }
  const dialog = Array.from(document.querySelectorAll("[role='dialog'], .eds-modal, .shopee-modal, .modal, .eds-dialog"))
    .find((element) => {
      const text = textOf(element);
      return visible(element) && /Edit Product Images|Rotate right|Flip horizontal|Preview/.test(text);
    });
  if (!dialog) {
    return { ok: false, skipped: "image_editor_not_open" };
  }
  const save = Array.from(dialog.querySelectorAll("button"))
    .find((button) => visible(button) && /^Save$/i.test(textOf(button)) && !button.disabled);
  if (!save) {
    return { ok: false, skipped: "image_editor_save_not_available", dialogText: textOf(dialog).slice(0, 120) };
  }
  save.click();
  return { ok: true, clicked: "image_editor_save" };
}

async function selectShopeeProductCategory(command) {
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
  function textOf(element) {
    return String(element.textContent || "").replace(/\s+/g, " ").trim();
  }
  function clickElement(element) {
    element.scrollIntoView?.({ block: "center", inline: "center" });
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
    element.click?.();
  }
  function normalizeCategory(value) {
    return String(value || "")
      .replace(/\s*>\s*/g, " > ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace("jewellery", "jewelry");
  }
  function categoryParts(value) {
    return normalizeCategory(value)
      .split(">")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  function targetCategoryPath(product) {
    const haystack = `${product?.title || ""} ${product?.category || ""} ${(product?.aliases || []).join(" ")}`.toLowerCase();
    if (/\b(brooch|brooches|pin|pins)\b/i.test(haystack)) {
      return ["fashion accessories", "additional accessories", "brooches & pins"];
    }
    if (/\b(charm|charms|pendant|pendants|ornament|ornaments)\b/i.test(haystack)) {
      return ["fashion accessories", "additional accessories", "charms, pendants & ornaments"];
    }
    if (/\bnecklace|necklaces\b/i.test(haystack)) {
      return ["fashion accessories", "necklaces"];
    }
    if (/\bring|rings\b/i.test(haystack)) {
      return ["fashion accessories", "fine jewelry", "rings"];
    }
    return categoryParts(product?.category);
  }
  function modalRoot() {
    return Array.from(document.querySelectorAll("[role='dialog'], .eds-modal, .shopee-modal, .portal-modal, body"))
      .find((element) => visible(element) && /Edit Category|Currently selected/i.test(textOf(element))) || document.body;
  }
  function categoryColumns(root = modalRoot()) {
    const lists = Array.from(root.querySelectorAll("ul"))
      .filter((list) => visible(list) && Array.from(list.querySelectorAll("li")).some((item) => visible(item) && textOf(item).length > 1));
    if (lists.length > 0) {
      return lists;
    }
    return Array.from(root.querySelectorAll("[class*='category-list'], [class*='category-column']"))
      .filter((list) => visible(list) && Array.from(list.querySelectorAll("li, [class*='category-item']")).some((item) => visible(item) && textOf(item).length > 1));
  }
  function columnItems(column) {
    return Array.from(column.querySelectorAll("li, [class*='category-item']"))
      .filter((item) => visible(item))
      .map((item) => ({ element: item, text: textOf(item), normalizedText: normalizeCategory(textOf(item)) }))
      .filter((item) => item.normalizedText.length > 1);
  }
  function pathMatches(selected, targetPath) {
    const selectedParts = categoryParts(selected);
    if (targetPath.length === 0) {
      return selectedParts.length >= 2 && !/additional accessories$/i.test(selected);
    }
    const leaf = targetPath.at(-1) || "";
    return selectedParts.length >= Math.min(2, targetPath.length) &&
      selectedParts.some((part) => part === leaf || part.includes(leaf) || leaf.includes(part)) &&
      !/additional accessories$/i.test(selected);
  }
  function findConfirmButton(root = modalRoot()) {
    return Array.from(root.querySelectorAll("button, [role='button']"))
      .find((button) => visible(button) && /^Confirm$/i.test(textOf(button)) && !button.disabled && button.getAttribute("aria-disabled") !== "true");
  }
  function selectedCategoryText() {
    const root = modalRoot();
    const currentSelected = String(root.innerText || root.textContent || "").match(/currently selected\s*:\s*([^\n]+)/i)?.[1];
    const formSelected = textOf(document.querySelector(".product-category-text, .product-category-box-inner") || "");
    return textOf({ textContent: currentSelected || formSelected });
  }
  async function driveCategoryModalPath(targetPath) {
    const clicked = [];
    for (let depth = 0; depth < targetPath.length; depth += 1) {
      const root = modalRoot();
      const columns = categoryColumns(root);
      const column = columns[Math.min(depth, Math.max(0, columns.length - 1))];
      if (!column) {
        return { ok: false, error: "category_column_not_found", depth, targetPath, clicked };
      }
      const items = columnItems(column);
      const target = targetPath[depth];
      const preferred = items.find((item) => item.normalizedText === target) ||
        items.find((item) => item.normalizedText.includes(target) || target.includes(item.normalizedText)) ||
        items.find((item) => target.split(/[^a-z0-9]+/i).filter((word) => word.length >= 4).some((word) => item.normalizedText.includes(word)));
      if (!preferred) {
        return { ok: false, error: "category_item_not_found", depth, target, available: items.map((item) => item.text).slice(0, 20), clicked };
      }
      clickElement(preferred.element);
      clicked.push(preferred.text);
      await delay(700);
    }
    const selected = selectedCategoryText();
    if (!pathMatches(selected, targetPath)) {
      return { ok: false, error: "category_leaf_not_selected", selected, targetPath, clicked };
    }
    const confirm = findConfirmButton();
    if (!confirm) {
      return { ok: false, error: "category_confirm_not_found", selected, targetPath, clicked };
    }
    clickElement(confirm);
    await delay(900);
    const formSelected = textOf(document.querySelector(".product-category-text, .product-category-box-inner") || "");
    return {
      ok: pathMatches(formSelected || selected, targetPath),
      selected: formSelected || selected,
      targetPath,
      clicked,
      confirmed: true
    };
  }
  function categoryCandidates() {
    return Array.from(document.querySelectorAll("button, [role='button'], li, a, div, span"))
      .filter((element) => visible(element))
      .map((element) => ({ element, text: textOf(element) }))
      .filter((candidate) =>
        candidate.text.length > 4 &&
        candidate.text.length <= 160 &&
        candidate.text.includes(">") &&
        !/please set category/i.test(candidate.text)
      )
      .map((candidate) => {
        const text = normalizeCategory(candidate.text.replace(/^Recently Used\s*/i, ""));
        const tagScore = /^(button|a|li)$/i.test(candidate.element.tagName) || candidate.element.getAttribute("role") === "button" ? 8 : 0;
        const recentlyUsedScore = /recently used/i.test(textOf(candidate.element.parentElement || candidate.element)) ? 4 : 0;
        const exactScore = requestedCategory && text === requestedCategory ? 20 : 0;
        const wordScore = categoryWords.filter((word) => text.includes(word)).length;
        return { ...candidate, normalizedText: text, score: exactScore + tagScore + recentlyUsedScore + wordScore };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);
  }
  const product = command?.payload?.product;
  const requestedCategory = normalizeCategory(product?.category);
  const targetPath = targetCategoryPath(product);
  const categoryWords = requestedCategory
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 4);
  const current = document.querySelector(".product-category-text, .product-category-box-inner");
  const currentText = current ? textOf(current) : "";
  if (currentText && !/please set category/i.test(currentText) && pathMatches(currentText, targetPath)) {
    return { ok: true, selected: currentText, alreadySelected: true };
  }

  if (/Edit Category|Currently selected/i.test(textOf(document.body))) {
    const driven = await driveCategoryModalPath(targetPath);
    if (driven.ok) {
      return { ...driven, requestedCategory };
    }
  }

  const categoryControl = document.querySelector(".product-category-box-inner, .product-category-box, [class*='product-category']");
  if (categoryControl) {
    clickElement(categoryControl);
    await delay(500);
  }

  const driven = await driveCategoryModalPath(targetPath);
  if (driven.ok) {
    return { ...driven, requestedCategory };
  }

  const preferred = categoryCandidates()[0];
  if (!preferred) {
    return { ok: false, error: driven.error || "category_option_not_found", requestedCategory, targetPath, diagnostic: driven };
  }
  clickElement(preferred.element);
  await delay(1000);
  const selected = textOf(document.querySelector(".product-category-text, .product-category-box-inner") || preferred.element);
  const confirm = findConfirmButton();
  if (confirm && pathMatches(selected, targetPath)) {
    clickElement(confirm);
    await delay(700);
  }
  const finalSelected = textOf(document.querySelector(".product-category-text, .product-category-box-inner") || preferred.element);
  return {
    ok: pathMatches(finalSelected || selected, targetPath),
    selected: finalSelected || selected,
    requestedCategory,
    targetPath,
    clicked: preferred.text,
    diagnostic: driven
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
  const composer = document.querySelector(
    "[data-liveseller-composer], [role='textbox'], div[contenteditable='true'], textarea[placeholder*='message' i], textarea, input[placeholder*='message' i]"
  );
  if (!text || !composer) {
    return { ok: false, error: "composer_not_found" };
  }
  const existingValue = "value" in composer ? composer.value : composer.innerText || composer.textContent || "";
  if (String(existingValue || "").trim()) {
    return { ok: false, error: "seller_is_typing" };
  }
  composer.focus?.();
  const execCommand = document.execCommand?.bind(document);
  let inserted = false;
  if (execCommand) {
    execCommand("selectAll");
    execCommand("delete");
    inserted = Boolean(execCommand("insertText", false, text));
  }
  if (!inserted && "value" in composer) {
    composer.value = text;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (!inserted) {
    composer.textContent = text;
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  }
  const send = document.querySelector("[data-liveseller-send], button[class*='send-btn']:not([disabled]), button[class*='send-btn'], button[type='submit']:not([disabled]), button[type='submit']");
  if (send instanceof HTMLButtonElement) {
    send.click();
  }
  return { ok: true, publicSend: true, title: document.title, url: location.href };
}

async function routeViewerMessageToRuntime(message, sourceTabId) {
  const text = String(message.text || "").trim();
  const viewerName = String(message.viewerName || message.viewerId || "Shopee Viewer").trim();
  const viewerId = String(message.viewerId || viewerName || "shopee-viewer").trim();
  if (message.isHost) {
    const isHostTestQuestion = AUTO_REPLY_ALLOW_HOST_TEST &&
      message.source === "shopee-live-dom-monitor" &&
      /\?|how much|price|ship|shipping|stock|available|can i|can you/i.test(text);
    if (!isHostTestQuestion) {
      return { ok: true, skipped: "host_message" };
    }
  }
  if (!text || autoReplySentTexts.has(text)) {
    return { ok: true, skipped: "empty_or_own_reply" };
  }
  const dedupeKey = autoReplyDedupeKey({ ...message, viewerId, viewerName, text });
  if (autoReplySeenMessages.has(dedupeKey)) {
    return { ok: true, skipped: "duplicate" };
  }
  autoReplySeenMessages.add(dedupeKey);

  const runtimeOriginRecord = await chrome.storage.session.get("liveseller:runtimeOrigin");
  const runtimeOrigin = runtimeOriginRecord["liveseller:runtimeOrigin"] || "http://127.0.0.1:8787";
  const event = {
    eventId: `shopee-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sessionId: AUTO_REPLY_SESSION_ID,
    timestamp: new Date().toISOString(),
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId,
      viewerName,
      text,
      language: /[\u4e00-\u9fff]/u.test(text) ? "zh" : "en",
      ...(message.productId ? { productId: message.productId } : {})
    }
  };
  const response = await fetch(`${runtimeOrigin}/api/runtime/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event)
  });
  const runtimeBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: runtimeBody.error || `runtime_${response.status}`, event };
  }
  const safeReplies = Array.isArray(runtimeBody.actions)
    ? runtimeBody.actions.filter(isLowRiskSendReply)
    : [];
  const executed = [];
  for (const action of safeReplies) {
    const tab = sourceTabId
      ? { id: sourceTabId }
      : await findOrCreateShopeeLiveTab();
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillShopeeReplyComposer,
      args: [action]
    });
    const evidence = result?.result || {};
    if (evidence.ok) autoReplySentTexts.add(action.payload.text.trim());
    executed.push({ actionId: action.actionId, evidence });
  }
  return { ok: true, event, actions: runtimeBody.actions || [], executed };
}

function autoReplyDedupeKey(message) {
  const text = String(message.text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const viewerName = String(message.viewerName || message.viewerId || "Shopee Viewer").replace(/\s+/g, " ").trim().toLowerCase();
  const viewerId = String(message.viewerId || viewerName || "shopee-viewer").replace(/\s+/g, " ").trim().toLowerCase();
  return `${message.commentId || viewerId}:${viewerName}:${text}`;
}

async function currentRuntimeProductId() {
  const runtimeOriginRecord = await chrome.storage.session.get("liveseller:runtimeOrigin");
  const runtimeOrigin = runtimeOriginRecord["liveseller:runtimeOrigin"] || "http://127.0.0.1:8787";
  try {
    const response = await fetch(`${runtimeOrigin}/api/overlay/${encodeURIComponent(AUTO_REPLY_SESSION_ID)}`);
    const overlay = await response.json().catch(() => ({}));
    return response.ok && typeof overlay.currentProductId === "string"
      ? overlay.currentProductId
      : undefined;
  } catch {
    return undefined;
  }
}

async function monitorShopeeLiveCommentsOnce() {
  if (liveCommentMonitorInFlight) {
    return { ok: true, skipped: "monitor_already_running" };
  }
  liveCommentMonitorInFlight = true;
  try {
    const tabs = await chrome.tabs.query({ url: "https://live.shopee.sg/pc/live*" });
    const monitored = [];
    const activeProductId = await currentRuntimeProductId();
    for (const tab of tabs) {
      if (!tab.id) continue;
      const [execution] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scanShopeeLiveComments
      });
      const messages = Array.isArray(execution?.result) ? execution.result : [];
      const routed = [];
      if (!liveCommentMonitorPrimedTabs.has(tab.id)) {
        for (const message of messages) {
          autoReplySeenMessages.add(autoReplyDedupeKey(message));
        }
        liveCommentMonitorPrimedTabs.add(tab.id);
        monitored.push({ tabId: tab.id, url: tab.url, messageCount: messages.length, skipped: "initial_comment_snapshot" });
        continue;
      }
      for (const message of messages) {
        routed.push(await routeViewerMessageToRuntime({
          ...message,
          productId: message.productId || activeProductId
        }, tab.id));
      }
      monitored.push({ tabId: tab.id, url: tab.url, messageCount: messages.length, routed });
    }
    return { ok: true, monitored };
  } finally {
    liveCommentMonitorInFlight = false;
  }
}

setInterval(() => {
  monitorShopeeLiveCommentsOnce().catch(() => undefined);
}, 1500);

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

async function fillShopeeProductDraft(tab, command, options = {}) {
  if (tab?.livesellerProductTabNotReady) {
    return {
      ok: false,
      error: "product_tab_not_ready",
      status: "product_tab_not_ready",
      url: tab.livesellerProductTabUrl,
      steps: [{
        step: "product_tab_ready",
        result: {
          ok: false,
          error: "product_tab_not_ready",
          url: tab.livesellerProductTabUrl
        }
      }]
    };
  }
  async function runShopeeProductStep(step, func, args = [], options = {}) {
    const attempts = options.attempts || 6;
    const retryMs = options.retryMs || 1200;
    let lastResult;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const [execution] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func,
        args
      });
      lastResult = execution?.result;
      const acceptable = options.accept
        ? options.accept(lastResult)
        : lastResult?.ok;
      if (acceptable) {
        return { step, result: { ...lastResult, attempt } };
      }
      await delay(retryMs);
    }
    return {
      step,
      result: {
        ...(lastResult || {}),
        ok: false,
        error: lastResult?.error || lastResult?.diagnostic || "product_form_not_ready"
      }
    };
  }
  const steps = [];
  steps.push(await runShopeeProductStep(
    "basic",
    fillShopeeCreateProductForm,
    [command, { section: "basic", submit: false, skipImages: options.submit === true }],
    {
      attempts: 10,
      retryMs: 1500,
      accept: (value) => Boolean(value?.ok && (value.filled?.length > 0 || value.uploadedImages?.count > 0))
    }
  ));
  await delay(1200);
  steps.push(await runShopeeProductStep(
    "image_editor_save",
    confirmShopeeImageEditorSave,
    [],
    {
      attempts: 2,
      retryMs: 700,
      accept: (value) => Boolean(value?.ok || value?.skipped === "image_editor_not_open")
    }
  ));
  await delay(800);

  steps.push(await runShopeeProductStep("category", selectShopeeProductCategory, [command], { attempts: 4, retryMs: 1200 }));
  await delay(1200);

  steps.push(await runShopeeProductStep("sales_tab", clickShopeeProductSection, [["Sales Information", "Sales"]], { attempts: 4, retryMs: 1000 }));
  await delay(500);
  steps.push(await runShopeeProductStep(
    "sales",
    fillShopeeCreateProductForm,
    [command, { section: "sales", submit: false, skipImages: true }],
    {
      attempts: 6,
      retryMs: 1200,
      accept: (value) => Boolean(value?.filled?.includes("price") && value?.filled?.includes("stock"))
    }
  ));

  steps.push(await runShopeeProductStep("shipping_tab", clickShopeeProductSection, [["Shipping"]], { attempts: 4, retryMs: 1000 }));
  await delay(500);
  steps.push(await runShopeeProductStep(
    options.submit === true ? "shipping_submit" : "shipping",
    fillShopeeCreateProductForm,
    [command, { section: "shipping", submit: options.submit === true, skipImages: true }],
    {
      attempts: 6,
      retryMs: 1200,
      accept: (value) => Boolean(value?.filled?.length > 0 || value?.submitted)
    }
  ));

  const last = steps.at(-1)?.result || {};
  const basic = steps.find((step) => step.step === "basic")?.result || {};
  const sales = steps.find((step) => step.step === "sales")?.result || {};
  const shipping = steps.find((step) => step.step === "shipping" || step.step === "shipping_submit")?.result || {};
  const uploadedImages = steps.find((step) => step.result?.uploadedImages)?.result?.uploadedImages || basic.uploadedImages || last.uploadedImages;
  const filled = [...new Set(steps.flatMap((step) => step.result?.filled || []))];
  const missing = [];
  if (!basic.filled?.some((field) => ["title", "description"].includes(field)) && !filled.some((field) => ["title", "description"].includes(field))) {
    missing.push("basic_product_fields");
  }
  if (!sales.filled?.includes("price") || !sales.filled?.includes("stock")) {
    missing.push("sales_price_stock");
  }
  if (!shipping.filled?.length) {
    missing.push("shipping_fields");
  }
  if (!uploadedImages || uploadedImages.count < 1) {
    missing.push(uploadedImages?.diagnostic || "product_image_not_uploaded");
  }
  const requiredStepsOk = missing.length === 0;
  return {
    ...last,
    ok: requiredStepsOk,
    error: requiredStepsOk ? last.error : `product_form_incomplete:${missing.join(",")}`,
    missing,
    submitted: Boolean(last.submitted),
    filled,
    uploadedImages,
    steps
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "liveseller:viewer-message") {
    chrome.storage.session.set({
      "liveseller:lastViewerMessage": {
        viewerId: message.viewerId,
        viewerName: message.viewerName,
        text: message.text,
        isHost: Boolean(message.isHost),
        source: message.source || "content-script",
        capturedAt: new Date().toISOString(),
      }
    });
    routeViewerMessageToRuntime(message, sender?.tab?.id)
      .then((result) => sendResponse({ ok: true, autoReply: result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
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
    if (productAutomationInFlight) {
      sendResponse({ ok: false, status: "product_creation_already_running", commandCount: 0 });
      return false;
    }
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
    const imageEvidence = createProductImageEvidence(commands[0]);
    if (!imageEvidence.firstImageIsDataUrl) {
      sendResponse({
        ok: false,
        status: "create_product_missing_generated_image_data",
        commandCount: commands.length,
        evidence: { image: imageEvidence }
      });
      return false;
    }
    productAutomationInFlight = true;
    findOrCreateShopeeProductTab({ resetToNewProduct: true })
      .then((tab) => fillShopeeProductDraft(tab, commands[0], { submit: false }))
      .then((result) => sendResponse({
        ok: Boolean(result?.ok),
        status: result?.ok ? "filled_authenticated_shopee_product_form" : "queued_for_authenticated_tab",
        commandCount: commands.length,
        evidence: { ...result, commandImage: imageEvidence }
      }))
      .catch((error) => sendResponse({
        ok: false,
        status: "queued_for_authenticated_tab",
        commandCount: commands.length,
        error: error.message
      }))
      .finally(() => {
        productAutomationInFlight = false;
      });
    return true;
  }

  if (message?.type === "liveseller:confirm-product-publish") {
    if (productAutomationInFlight) {
      sendResponse({ ok: false, status: "product_creation_already_running", commandCount: 0 });
      return false;
    }
    const commands = approvedCreateProductCommands(message.commands);
    if (commands.length === 0) {
      sendResponse({ ok: false, status: "no_approved_create_product_commands", commandCount: 0 });
      return false;
    }
    productAutomationInFlight = true;
    findOrCreateShopeeProductTab({ resetToNewProduct: false })
      .then((tab) => fillShopeeProductDraft(tab, commands[0], { submit: true }))
      .then((result) => sendResponse({
        ok: Boolean(result?.ok && result?.submitted),
        status: result?.submitted ? "submitted_authenticated_shopee_product_form" : "product_form_submit_not_available",
        commandCount: commands.length,
        evidence: result
      }))
      .catch((error) => sendResponse({
        ok: false,
        status: "product_form_submit_failed",
        commandCount: commands.length,
        error: error.message
      }))
      .finally(() => {
        productAutomationInFlight = false;
      });
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
