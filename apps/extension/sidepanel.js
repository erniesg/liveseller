const $ = (selector) => document.querySelector(selector);

const state = {
  reviewPlan: undefined,
  createProductCommands: [],
  startLivestreamCommands: [],
  intakeReviewItems: [],
  latestActions: [],
  capturedMessage: undefined,
  createProductExecuted: false,
  livestreamPrepared: false,
  overlayOpened: false,
  shopeePreview: undefined,
  overlayPipeStarted: false,
  latestCompositorStatus: undefined,
  queuedProductCreation: []
};

let intakeImages = [];

function runtimeOrigin() {
  return $("#runtime-origin").value.trim().replace(/\/$/u, "") || "http://127.0.0.1:8787";
}

function reviewSessionId() {
  return $("#review-session-id").value.trim() || "live-seed-001";
}

function liveSessionId() {
  return $("#live-session-id").value.trim() || reviewSessionId();
}

function publicOverlayUrl() {
  return `http://127.0.0.1:5180/?runtimeOrigin=${encodeURIComponent(runtimeOrigin())}&sessionId=${encodeURIComponent(liveSessionId())}`;
}

function cameraPreviewUrl() {
  return `${runtimeOrigin()}/camera-compositor/preview?overlayUrl=${encodeURIComponent(publicOverlayUrl())}`;
}

function setConnection(label, kind = "") {
  const node = $("#connection");
  node.textContent = label;
  node.className = `status ${kind}`.trim();
}

function writeLog(selector, value) {
  const node = $(selector);
  node.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleCase(value) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferProductName(fileName) {
  const cleanName = fileName
    .replace(/\.[^.]+$/u, "")
    .replaceAll(/[_-]+/gu, " ")
    .replace(/\b(img|image|photo|product|shopee|upload)\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return cleanName ? titleCase(cleanName) : "New Product";
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${runtimeOrigin()}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  }
  return body;
}

async function checkRuntime() {
  try {
    await fetchJson("/health");
    setConnection("Runtime live", "live");
  } catch (error) {
    setConnection("Runtime offline", "error");
    throw error;
  }
}

function currentItems() {
  return [...state.intakeReviewItems, ...(state.reviewPlan?.items || [])];
}

function allProductsApproved() {
  return currentItems().length > 0 && currentItems().every((item) =>
    item.decision.status === "approved" || item.decision.status === "edited"
  );
}

function updateLaunchChecklist() {
  const checks = {
    "approved-products": allProductsApproved(),
    "create-products": state.createProductExecuted,
    "prepare-live": state.livestreamPrepared,
    "overlay-open": state.overlayOpened,
    "seller-preview": Boolean(state.shopeePreview?.rtmpUrlPresent && state.overlayPipeStarted)
  };
  for (const [name, complete] of Object.entries(checks)) {
    const node = document.querySelector(`[data-check="${name}"]`);
    if (!node) {
      continue;
    }
    node.classList.toggle("complete", complete);
    node.setAttribute("aria-checked", String(complete));
  }
  $("#public-overlay-url").value = publicOverlayUrl();
  $("#camera-preview-url").value = cameraPreviewUrl();
}

function productFromCard(card, item) {
  const product = structuredClone(item.product);
  product.title = card.querySelector("[data-field='title']").value.trim() || product.title;
  product.description = card.querySelector("[data-field='description']").value.trim() || product.description;
  product.category = card.querySelector("[data-field='category']").value.trim() || product.category;
  product.price = Number(card.querySelector("[data-field='price']").value || product.price);
  product.stock = Number.parseInt(card.querySelector("[data-field='stock']").value || product.stock, 10);
  return product;
}

function hasProductEdits(product, item) {
  return JSON.stringify({
    title: product.title,
    description: product.description,
    category: product.category,
    price: product.price,
    stock: product.stock
  }) !== JSON.stringify({
    title: item.product.title,
    description: item.product.description,
    category: item.product.category,
    price: item.product.price,
    stock: item.product.stock
  });
}

function buildDecision(card, item, status) {
  const decidedAt = new Date().toISOString();
  if (status === "rejected") {
    return {
      decisionId: `decision-${item.productId}-rejected-${Date.parse(decidedAt)}`,
      productId: item.productId,
      status,
      decidedBy: "seller",
      decidedAt,
      reason: "Seller rejected this product from the Chrome side panel.",
      citations: item.product.evidence
    };
  }

  const editedProduct = productFromCard(card, item);
  const edited = hasProductEdits(editedProduct, item);
  return {
    decisionId: `decision-${item.productId}-${edited ? "edited" : "approved"}-${Date.parse(decidedAt)}`,
    productId: item.productId,
    status: edited ? "edited" : "approved",
    decidedBy: "seller",
    decidedAt,
    reason: edited
      ? "Seller edited and approved this product from the Chrome side panel."
      : "Seller approved this product from the Chrome side panel.",
    editedProduct: edited ? editedProduct : undefined,
    citations: item.product.evidence
  };
}

function renderReviewPlan() {
  const items = currentItems();
  $("#review-status").textContent = state.reviewPlan
    ? `${state.reviewPlan.status} - ${items.length} products`
    : "No review plan loaded.";
  $("#approve-all").disabled = !state.reviewPlan;
  updateLaunchChecklist();
  const root = $("#review-items");
  root.replaceChildren();

  for (const item of items) {
    const card = document.createElement("article");
    card.className = `product-card ${item.decision.status}`;
    card.dataset.productId = item.productId;
    card.innerHTML = `
      <div>
        <span class="tag">${escapeHtml(item.decision.status)}</span>
        <h3>${escapeHtml(item.product.title)}</h3>
      </div>
      <div class="product-grid">
        <label>Title <input data-field="title" value="${escapeHtml(item.product.title)}" /></label>
        <label>Category <input data-field="category" value="${escapeHtml(item.product.category)}" /></label>
        <label>Price <input data-field="price" type="number" step="0.01" value="${escapeHtml(item.product.price)}" /></label>
        <label>Stock <input data-field="stock" type="number" value="${escapeHtml(item.product.stock)}" /></label>
      </div>
      <label>Description <textarea data-field="description" rows="3">${escapeHtml(item.product.description)}</textarea></label>
      <div class="button-row">
        <button data-action="approve" type="button">Approve or save edit</button>
        <button data-action="reject" type="button">Reject</button>
      </div>
    `;
    card.querySelector("[data-action='approve']").addEventListener("click", () =>
      void submitDecision(card, item, "approved")
    );
    card.querySelector("[data-action='reject']").addEventListener("click", () =>
      void submitDecision(card, item, "rejected")
    );
    root.append(card);
  }
}

function renderIntake() {
  $("#intake-image-count").textContent = intakeImages.length === 0
    ? "No images"
    : `${intakeImages.length} image${intakeImages.length === 1 ? "" : "s"}`;
  $("#create-intake-review").disabled = intakeImages.length === 0;
  const root = $("#intake-preview-grid");
  root.replaceChildren();
  for (const [index, image] of intakeImages.entries()) {
    const item = document.createElement("div");
    item.className = "preview-item";
    item.innerHTML = `
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name)}" />
      <button type="button" aria-label="Remove image">x</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      URL.revokeObjectURL(image.url);
      intakeImages = intakeImages.filter((_, imageIndex) => imageIndex !== index);
      renderIntake();
    });
    root.append(item);
  }
}

function fillIntakeDraft() {
  const primary = intakeImages[0];
  const name = inferProductName(primary?.name || "New Product");
  if (!$("#intake-product-name").value.trim()) {
    $("#intake-product-name").value = name;
  }
  if (!$("#intake-description").value.trim()) {
    $("#intake-description").value =
      `Seller-supplied image draft for ${name}. Verify exact product condition, variants, price, and stock before approving.`;
  }
  writeLog("#intake-log", {
    status: "draft_ready",
    imageCount: intakeImages.length,
    source: "extension_side_panel_drag_drop",
    requiresSellerApproval: true
  });
}

function addIntakeFiles(files) {
  const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
  intakeImages.push(...images.map((file) => ({
    name: file.name,
    url: URL.createObjectURL(file)
  })));
  fillIntakeDraft();
  renderIntake();
}

function createIntakeReviewDraft() {
  const now = new Date().toISOString();
  const productId = `sidepanel-${Date.now()}`;
  const product = {
    id: productId,
    title: $("#intake-product-name").value.trim() || inferProductName(intakeImages[0]?.name || "New Product"),
    sku: `SIDE-${Date.now()}`,
    category: $("#intake-category").value.trim() || "Fashion Accessories",
    price: Number($("#intake-price").value || 19.9),
    currency: "SGD",
    stock: Number.parseInt($("#intake-stock").value || "20", 10),
    description: $("#intake-description").value.trim(),
    evidence: [{
      sourceId: "extension-sidepanel-intake",
      sourceType: "image",
      locator: intakeImages.map((image) => image.name).join(", "),
      excerpt: "Seller dragged product images into the Chrome extension side panel.",
      confidence: 0.75
    }],
    media: {
      images: intakeImages.map((image, index) => ({
        id: `${productId}-image-${index}`,
        uri: image.url,
        alt: image.name,
        citations: [{
          sourceId: "extension-sidepanel-intake",
          sourceType: "image",
          locator: image.name,
          excerpt: `Seller supplied product photo copied from side-panel file: ${image.name}`,
          confidence: 0.75
        }]
      }))
    }
  };
  const item = {
    localOnly: true,
    createdAt: now,
    reviewItemId: `review-${productId}`,
    productId,
    product,
    decision: {
      status: "pending",
      citations: product.evidence
    },
    reviewRequiredReason: "Seller-created side-panel image draft requires approval before publish.",
    suggestedActions: [
      "Verify image accuracy",
      "Confirm price and stock",
      "Approve or save edits before creating Shopee product"
    ]
  };
  state.intakeReviewItems = [item, ...state.intakeReviewItems];
  state.createProductCommands = [];
  state.startLivestreamCommands = [];
  renderReviewPlan();
  renderCommands();
  writeLog("#intake-log", {
    status: "review_draft_created",
    productId,
    imageCount: intakeImages.length,
    note: "Draft is local to the side panel until seller approval/publish integration."
  });
}

function clearIntake() {
  for (const image of intakeImages) {
    URL.revokeObjectURL(image.url);
  }
  intakeImages = [];
  $("#intake-product-name").value = "";
  $("#intake-description").value = "";
  renderIntake();
  writeLog("#intake-log", "Drop images to begin.");
}

function renderCommands() {
  $("#execute-create-products").disabled = state.createProductCommands.length === 0;
  $("#prepare-livestream").disabled = state.startLivestreamCommands.length === 0;
  updateLaunchChecklist();
  writeLog("#command-log", {
    createProductCommands: state.createProductCommands.map((command) => ({
      commandId: command.commandId,
      productId: command.productId,
      approvalStatus: command.approvalStatus,
      kind: command.kind
    }))
  });
  writeLog("#livestream-log", {
    startLivestreamCommands: state.startLivestreamCommands.map((command) => ({
      commandId: command.commandId,
      kind: command.kind,
      safetyMode: command.safetyMode,
      credentialEvidence: command.payload.credentialEvidence,
      goLive: command.payload.goLive
    }))
  });
}

async function loadReviewPlan() {
  await checkRuntime();
  state.reviewPlan = await fetchJson(`/api/prep/review-plan/${encodeURIComponent(reviewSessionId())}`);
  state.createProductCommands = [];
  state.startLivestreamCommands = [];
  state.createProductExecuted = false;
  state.livestreamPrepared = false;
  renderReviewPlan();
  renderCommands();
}

async function submitDecision(card, item, status) {
  const decision = buildDecision(card, item, status);
  if (item.localOnly) {
    state.intakeReviewItems = state.intakeReviewItems.map((candidate) =>
      candidate.productId === item.productId
        ? {
            ...candidate,
            decision,
            localApprovalStatus: decision.status
          }
        : candidate
    );
    renderReviewPlan();
    renderCommands();
    writeLog("#intake-log", {
      status: "local_review_decision_recorded",
      productId: item.productId,
      decision: decision.status,
      note: "Side-panel image drafts are reviewable now; Shopee create_product commands still require server-backed ingestion."
    });
    return;
  }
  const response = await fetchJson("/api/prep/review-decisions", {
    method: "POST",
    body: JSON.stringify({
      reviewPlan: state.reviewPlan,
      decision
    })
  });
  state.reviewPlan = response.reviewPlan;
  state.createProductCommands = response.createProductCommands || [];
  state.startLivestreamCommands = response.startLivestreamCommands || [];
  renderReviewPlan();
  renderCommands();
}

async function approveAll() {
  for (const item of [...currentItems()]) {
    const latest = currentItems().find((candidate) => candidate.productId === item.productId);
    if (!latest || latest.decision.status === "approved" || latest.decision.status === "edited") {
      continue;
    }
    const card = document.querySelector(`[data-product-id="${latest.productId}"]`);
    await submitDecision(card, latest, "approved");
  }
}

function actionCue(action) {
  if (action.type === "send_reply" && action.risk === "low" && !action.requiresApproval) {
    return "Say this";
  }
  if (action.requiresApproval || action.type === "request_approval") {
    return "Needs approval";
  }
  if (action.type === "escalate") {
    return "Escalate";
  }
  return "Runtime cue";
}

function actionText(action) {
  return action.payload?.text ||
    action.payload?.prompt ||
    action.payload?.proposedPublicText ||
    action.payload?.sellerMessage ||
    action.payload?.suggestedScript ||
    action.reason;
}

function renderSuggestions(actions) {
  const root = $("#suggestion-log");
  root.replaceChildren();
  const sellerActions = actions.filter((action) =>
    ["send_reply", "draft_reply", "request_approval", "escalate"].includes(action.type)
  );
  if (sellerActions.length === 0) {
    root.textContent = "No seller suggestion returned.";
    return;
  }
  for (const action of sellerActions) {
    const card = document.createElement("article");
    card.className = "suggestion-card";
    card.innerHTML = `
      <span class="tag">${escapeHtml(actionCue(action))}</span>
      <strong>${escapeHtml(actionText(action))}</strong>
      <p>${escapeHtml(action.type)} - ${escapeHtml(action.risk)} - ${action.requiresApproval ? "approval required" : "auto eligible"}</p>
      <p>${escapeHtml(action.reason)}</p>
    `;
    root.append(card);
  }
}

async function postRuntimeEvent(event) {
  const response = await fetchJson("/api/runtime/events", {
    method: "POST",
    body: JSON.stringify(event)
  });
  state.latestActions = response.actions || [];
  renderSuggestions(state.latestActions);
  return response;
}

async function sendViewerMessage() {
  await postRuntimeEvent({
    eventId: `sidepanel-viewer-${Date.now()}`,
    sessionId: liveSessionId(),
    timestamp: new Date().toISOString(),
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId: "sidepanel-viewer",
      viewerName: $("#viewer-name").value.trim() || "Test Buyer",
      text: $("#viewer-message").value.trim() || "How much?",
      language: "en"
    }
  });
}

async function sendHostCaption() {
  await postRuntimeEvent({
    eventId: `sidepanel-host-${Date.now()}`,
    sessionId: liveSessionId(),
    timestamp: new Date().toISOString(),
    source: "host",
    type: "host_transcript",
    payload: {
      text: $("#host-caption").value.trim(),
      language: $("#host-language").value,
      confidence: 0.95
    }
  });
}

async function requestRealtimeSession() {
  try {
    const session = await startRealtimeAgent();
    writeLog("#realtime-log", {
      status: "openai_realtime_agent_session_ready",
      agent: session.agent,
      clientSecretPresent: Boolean(session.client_secret || session.value),
      note: "Use the returned ephemeral client secret with @openai/agents/realtime in the seller-private UI."
    });
  } catch (error) {
    writeLog("#realtime-log", error.message);
  }
}

async function startRealtimeAgent() {
  const response = await fetchJson("/api/runtime/realtime/agent-session", {
    method: "POST",
    body: JSON.stringify({
      sessionId: liveSessionId(),
      voice: "marin"
    })
  });
  writeLog("#realtime-log", {
    status: "openai_realtime_agent_session_ready",
    clientSecretPresent: Boolean(response.client_secret || response.value),
    agent: response.agent,
    note: "Use the returned ephemeral client secret with @openai/agents/realtime in the seller-private UI."
  });
  return response;
}

async function loadProductScripts() {
  const response = await fetchJson(`/api/live-sessions/${encodeURIComponent(liveSessionId())}/script-suggestions`);
  const root = $("#script-suggestion-log");
  root.replaceChildren();
  for (const suggestion of response.suggestions || []) {
    const card = document.createElement("article");
    card.className = "suggestion-card";
    card.innerHTML = `
      <span class="tag">${escapeHtml(suggestion.facts?.price || "")}</span>
      <strong>${escapeHtml(suggestion.title)}</strong>
      <p>${escapeHtml(suggestion.script)}</p>
    `;
    root.append(card);
  }
  if (!response.suggestions?.length) {
    root.textContent = "No script suggestions returned.";
  }
}

function openPublicOverlay() {
  const url = publicOverlayUrl();
  state.overlayOpened = true;
  updateLaunchChecklist();
  if (globalThis.chrome?.tabs) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

function openCameraPreview() {
  const url = cameraPreviewUrl();
  if (globalThis.chrome?.tabs) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

async function copyPublicOverlayUrl() {
  $("#public-overlay-url").value = publicOverlayUrl();
  state.overlayOpened = true;
  updateLaunchChecklist();
  await navigator.clipboard?.writeText(publicOverlayUrl());
}

function openShopeeLiveSetup() {
  const url = $("#shopee-live-url").value.trim() || "https://live.shopee.sg/pc/setup?from=seller_center";
  if (globalThis.chrome?.tabs) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

function executeCreateProducts() {
  state.createProductExecuted = state.createProductCommands.length > 0;
  updateLaunchChecklist();
  writeLog("#command-log", {
    status: "ready_for_authenticated_tab_execution",
    commands: state.createProductCommands.map((command) => command.commandId),
    note: "Real Shopee product creation remains content-script authenticated-tab work."
  });
}

function prepareLivestream() {
  state.livestreamPrepared = state.startLivestreamCommands.length > 0;
  updateLaunchChecklist();
  writeLog("#livestream-log", {
    status: "prepared_dry_run",
    evidence: state.startLivestreamCommands.map((command) => ({
      commandId: command.commandId,
      liveSessionCreated: true,
      credentialEvidence: {
        serverUrl: "present_redacted",
        secretToken: "present_redacted"
      },
      publicOverlayReady: true,
      goLivePressed: false
    }))
  });
}

async function aiPrepareShopeePreview() {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    writeLog("#livestream-log", "Chrome extension runtime is required for Shopee UI automation.");
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: "liveseller:prepare-shopee-test-preview" });
  if (!response?.ok) {
    state.shopeePreview = undefined;
    $("#start-overlay-pipe").disabled = true;
    updateLaunchChecklist();
    writeLog("#livestream-log", {
      status: "shopee_preview_not_ready",
      error: response?.error,
      previewUrl: response?.previewUrl,
      rtmpUrlPresent: Boolean(response?.rtmpUrlPresent),
      rtmpKeyPresent: Boolean(response?.rtmpKeyPresent),
      goLiveVisible: Boolean(response?.goLiveVisible),
      goLivePressed: false
    });
    return;
  }

  state.shopeePreview = response;
  state.overlayPipeStarted = false;
  $("#start-overlay-pipe").disabled = false;
  updateLaunchChecklist();
  writeLog("#livestream-log", {
    status: "shopee_test_preview_ready",
    previewUrl: response.previewUrl,
    rtmpUrlPresent: Boolean(response.rtmpUrlPresent),
    rtmpKeyPresent: Boolean(response.rtmpKeyPresent),
    goLiveVisible: Boolean(response.goLiveVisible),
    commentsVisible: Boolean(response.commentsVisible),
    goLivePressed: false
  });
}

async function startOverlayPreviewPipe() {
  if (!state.shopeePreview?.rtmpUrl || !state.shopeePreview?.rtmpKey) {
    writeLog("#livestream-log", "Prepare Shopee Test preview first.");
    return;
  }
  const response = await fetchJson("/api/shopee/runtime-compositor/start", {
    method: "POST",
    body: JSON.stringify({
      rtmpUrl: state.shopeePreview.rtmpUrl,
      rtmpKey: state.shopeePreview.rtmpKey,
      overlayUrl: publicOverlayUrl(),
      sellerPreviewUrl: cameraPreviewUrl(),
      durationSeconds: 60
    })
  });
  state.overlayPipeStarted = true;
  updateLaunchChecklist();
  writeLog("#livestream-log", {
    ...response,
    previewUrl: state.shopeePreview.previewUrl,
    sellerPreviewUrl: cameraPreviewUrl(),
    goLivePressed: false
  });
  await refreshCameraStatus();
}

async function refreshCameraStatus() {
  const status = await fetchJson("/api/shopee/runtime-compositor/status");
  state.latestCompositorStatus = status;
  state.overlayPipeStarted = status.state === "running";
  updateLaunchChecklist();
  writeLog("#camera-status-log", status);
  return status;
}

async function stopOverlayPreviewPipe() {
  const status = await fetchJson("/api/shopee/runtime-compositor/stop", {
    method: "POST",
    body: "{}"
  });
  state.latestCompositorStatus = status;
  state.overlayPipeStarted = false;
  updateLaunchChecklist();
  writeLog("#camera-status-log", status);
}

async function applyOverlayBackground() {
  const mode = $("#overlay-background-mode").value;
  const value = $("#overlay-background-value").value.trim() || "default";
  const label = $("#overlay-background-label").value.trim() || "Seller selected background";
  const response = await fetchJson(`/api/overlay/${encodeURIComponent(liveSessionId())}/background`, {
    method: "POST",
    body: JSON.stringify({
      background: {
        mode,
        value,
        label
      }
    })
  });
  writeLog("#overlay-background-log", {
    status: "overlay_background_updated",
    background: response.background
  });
}

async function sendLowRiskReplyThroughShopeeTab() {
  const action = state.latestActions.find((candidate) =>
    candidate.type === "send_reply" &&
    candidate.risk === "low" &&
    !candidate.requiresApproval &&
    candidate.payload?.text
  );
  if (!action) {
    writeLog("#suggestion-log", "No low-risk no-approval reply is available to send.");
    return;
  }
  if (!globalThis.chrome?.runtime?.sendMessage) {
    writeLog("#suggestion-log", "Chrome extension runtime is required for Shopee reply execution.");
    return;
  }
  const response = await chrome.runtime.sendMessage({
    type: "liveseller:execute-seller-command",
    action
  });
  writeLog("#suggestion-log", {
    status: response?.ok ? "shopee_reply_sent_or_queued" : "shopee_reply_not_sent",
    actionId: action.actionId,
    risk: action.risk,
    requiresApproval: action.requiresApproval,
    result: response
  });
}

async function queueShopeeProductCreation() {
  const approvedCommands = state.createProductCommands.filter((command) =>
    command.kind === "create_product" &&
    (command.approvalStatus === "approved" || command.approvalStatus === "edited")
  );
  if (approvedCommands.length === 0) {
    writeLog("#product-creation-log", "No approved create_product command is available.");
    return;
  }
  state.queuedProductCreation = approvedCommands.map((command) => ({
    commandId: command.commandId,
    productId: command.productId,
    approvalStatus: command.approvalStatus,
    queuedAt: new Date().toISOString()
  }));
  if (globalThis.chrome?.runtime?.sendMessage) {
    const response = await chrome.runtime.sendMessage({
      type: "liveseller:queue-create-products",
      commands: approvedCommands
    });
    writeLog("#product-creation-log", {
      status: response?.ok ? "queued_for_authenticated_shopee_tab" : "queue_recorded_side_panel_only",
      commands: state.queuedProductCreation,
      result: response
    });
    return;
  }
  writeLog("#product-creation-log", {
    status: "queue_recorded_side_panel_only",
    commands: state.queuedProductCreation,
    note: "Chrome extension runtime is required to execute inside an authenticated Shopee seller tab."
  });
}

async function useCapturedMessage() {
  const stored = await globalThis.chrome?.storage?.session?.get("liveseller:lastViewerMessage");
  const message = stored?.["liveseller:lastViewerMessage"];
  if (!message) {
    writeLog("#suggestion-log", "No captured Shopee viewer message in extension storage.");
    return;
  }
  $("#viewer-name").value = message.viewerName || "Shopee Viewer";
  $("#viewer-message").value = message.text || "";
  await sendViewerMessage();
}

function renderCodexEvents() {
  try {
    const payload = JSON.parse($("#codex-events-json").value || "{}");
    const events = Array.isArray(payload.events) ? payload.events : [];
    const root = $("#codex-event-log");
    root.replaceChildren();
    for (const event of events) {
      const card = document.createElement("article");
      card.className = "suggestion-card";
      card.innerHTML = `
        <strong>${escapeHtml(event.type || "event")} ${event.tool ? `- ${escapeHtml(event.tool)}` : ""}</strong>
        <p>${escapeHtml(event.message || "")}</p>
        <p>${escapeHtml(event.timestamp || "")}</p>
      `;
      root.append(card);
    }
    if (events.length === 0) {
      root.textContent = "No events in JSON payload.";
    }
  } catch (error) {
    writeLog("#codex-event-log", error.message);
  }
}

$("#load-review-plan").addEventListener("click", () => void loadReviewPlan().catch((error) => writeLog("#review-status", error.message)));
$("#approve-all").addEventListener("click", () => void approveAll().catch((error) => writeLog("#command-log", error.message)));
$("#intake-file-input").addEventListener("change", (event) => addIntakeFiles(event.target.files || []));
$("#intake-dropzone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("#intake-dropzone").classList.add("active");
});
$("#intake-dropzone").addEventListener("dragleave", () => $("#intake-dropzone").classList.remove("active"));
$("#intake-dropzone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("#intake-dropzone").classList.remove("active");
  addIntakeFiles(event.dataTransfer?.files || []);
});
$("#create-intake-review").addEventListener("click", createIntakeReviewDraft);
$("#clear-intake").addEventListener("click", clearIntake);
$("#execute-create-products").addEventListener("click", executeCreateProducts);
$("#prepare-livestream").addEventListener("click", prepareLivestream);
$("#ai-prepare-shopee-preview").addEventListener("click", () => void aiPrepareShopeePreview().catch((error) => writeLog("#livestream-log", error.message)));
$("#start-overlay-pipe").addEventListener("click", () => void startOverlayPreviewPipe().catch((error) => writeLog("#livestream-log", error.message)));
$("#refresh-camera-status").addEventListener("click", () => void refreshCameraStatus().catch((error) => writeLog("#camera-status-log", error.message)));
$("#stop-overlay-pipe").addEventListener("click", () => void stopOverlayPreviewPipe().catch((error) => writeLog("#camera-status-log", error.message)));
$("#apply-overlay-background").addEventListener("click", () => void applyOverlayBackground().catch((error) => writeLog("#overlay-background-log", error.message)));
$("#open-public-overlay").addEventListener("click", openPublicOverlay);
$("#open-camera-preview").addEventListener("click", openCameraPreview);
$("#copy-public-overlay").addEventListener("click", () => void copyPublicOverlayUrl().catch((error) => writeLog("#livestream-log", error.message)));
$("#open-shopee-live").addEventListener("click", openShopeeLiveSetup);
$("#send-viewer-message").addEventListener("click", () => void sendViewerMessage().catch((error) => writeLog("#suggestion-log", error.message)));
$("#send-safe-reply").addEventListener("click", () => void sendLowRiskReplyThroughShopeeTab().catch((error) => writeLog("#suggestion-log", error.message)));
$("#queue-shopee-product-creation").addEventListener("click", () => void queueShopeeProductCreation().catch((error) => writeLog("#product-creation-log", error.message)));
$("#send-host-caption").addEventListener("click", () => void sendHostCaption().catch((error) => writeLog("#realtime-log", error.message)));
$("#request-realtime-session").addEventListener("click", () => void requestRealtimeSession());
$("#start-realtime-agent").addEventListener("click", () => void startRealtimeAgent().catch((error) => writeLog("#realtime-log", error.message)));
$("#load-product-scripts").addEventListener("click", () => void loadProductScripts().catch((error) => writeLog("#script-suggestion-log", error.message)));
$("#use-captured-message").addEventListener("click", () => void useCapturedMessage());
$("#render-codex-events").addEventListener("click", renderCodexEvents);

void checkRuntime().catch(() => undefined);
renderIntake();
updateLaunchChecklist();
