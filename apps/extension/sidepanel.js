const $ = (selector) => document.querySelector(selector);
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";

const state = {
  reviewPlan: undefined,
  reviewPlanSource: undefined,
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
  liveSessionRegistered: false,
  viewerUrl: "",
  queuedProductCreation: [],
  productCreationFilled: false,
  productEvents: [],
  realtimeAgentConnected: false,
  realtimeToolCalls: [],
  sellerTimelineEvents: [],
  sellerTimelineRuntimeCursor: 0,
  sellerTimelineOperatorCursor: 0,
  productEventKeys: new Set(),
  runtimeLiveSession: undefined,
  liveEvents: []
};

let intakeImages = [];
const cachedPlanStorageKey = "liveseller:lastProductPlan";

const stepTitles = {
  products: "Start with products",
  live: "Go live",
  audience: "Talk to viewers"
};

function setActiveStep(step) {
  const activeStep = stepTitles[step] ? step : "products";
  $("#active-step-title").textContent = stepTitles[activeStep];
  document.querySelectorAll("[data-step]").forEach((section) => {
    section.classList.toggle("active-step", section.getAttribute("data-step") === activeStep);
  });
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-step-target") === activeStep);
  });
}

function toggleSettingsPanel() {
  const panel = $("#settings-panel");
  const button = $("#toggle-settings");
  const open = panel.hasAttribute("hidden");
  panel.toggleAttribute("hidden", !open);
  button.setAttribute("aria-expanded", String(open));
}

function runtimeOrigin() {
  return $("#runtime-origin").value.trim().replace(/\/$/u, "") || "http://127.0.0.1:8787";
}

function operatorOrigin() {
  return $("#operator-origin").value.trim().replace(/\/$/u, "") || "http://127.0.0.1:8788";
}

function reviewSessionId() {
  return $("#review-session-id").value.trim() || "live-vintage-jewelry-001";
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

function sellerViewerUrl() {
  return state.viewerUrl || state.shopeePreview?.previewUrl || "";
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

function appendLiveEvent(title, detail = "", status = "info", extra = {}) {
  state.liveEvents.unshift({
    timestamp: new Date().toISOString(),
    status,
    title,
    detail,
    ...extra
  });
  state.liveEvents = state.liveEvents.slice(0, 30);
  writeLog("#livestream-log", {
    events: state.liveEvents
  });
}

function renderProductEvents() {
  const root = $("#product-event-log");
  const count = $("#product-event-count");
  if (count) {
    count.textContent = String(state.productEvents.length);
  }
  root.replaceChildren();
  if (state.productEvents.length === 0) {
    root.textContent = "No activity yet.";
    return;
  }
  for (const event of state.productEvents.slice(0, 40)) {
    const row = document.createElement("div");
    row.className = `activity-row ${event.status || "info"}`;
    row.innerHTML = `
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(event.detail || "")}</span>
      <span>${escapeHtml(event.timestamp)}</span>
    `;
    root.append(row);
  }
}

function appendProductEvent(title, detail = "", status = "info", options = {}) {
  if (options.key) {
    if (state.productEventKeys.has(options.key)) {
      return;
    }
    state.productEventKeys.add(options.key);
  }
  state.productEvents = [{
    title,
    detail,
    status,
    timestamp: options.timestamp || new Date().toLocaleTimeString()
  }, ...state.productEvents].slice(0, 80);
  renderProductEvents();
}

function stripLargeCachedValues(value) {
  if (typeof value === "string") {
    if (value.startsWith("data:image/") || value.length > 12000) {
      return "[omitted-large-value]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stripLargeCachedValues(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      key === "uri" || key === "dataUrl" ? stripLargeCachedValues(entry) : stripLargeCachedValues(entry)
    ]));
  }
  return value;
}

function writeCachedPlan(payload) {
  try {
    localStorage.setItem(cachedPlanStorageKey, JSON.stringify(stripLargeCachedValues(payload)));
  } catch (error) {
    appendProductEvent("Cache skipped", error instanceof Error ? error.message : String(error), "warning");
  }
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

async function fetchOperatorJson(path, options = {}) {
  const response = await fetch(`${operatorOrigin()}${path}`, {
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

function timelineKey(event) {
  return `${event.service || "unknown"}:${event.id || event.timestamp || Math.random()}`;
}

function productEventFromTimeline(event, key) {
  appendProductEvent(
    event.title || event.kind || "Timeline event",
    event.detail || event.message || event.tool || "",
    event.status === "error" || event.status === "failed" ? "error" : event.status === "success" ? "success" : "info",
    {
      key: `timeline:${key}`,
      timestamp: event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : undefined
    }
  );
}

function renderSellerTimeline() {
  const root = $("#seller-timeline-log");
  root.replaceChildren();
  const events = [...state.sellerTimelineEvents]
    .sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")))
    .slice(0, 40);
  if (events.length === 0) {
    root.textContent = "No timeline events loaded.";
    return;
  }
  for (const event of events) {
    const card = document.createElement("article");
    card.className = "suggestion-card timeline-card";
    card.innerHTML = `
      <div>
        <span class="tag">${escapeHtml(event.service || "event")}</span>
        <span class="tag">${escapeHtml(event.status || "info")}</span>
      </div>
      <strong>${escapeHtml(event.title || event.kind || "Timeline event")}</strong>
      <p>${escapeHtml(event.detail || "")}</p>
      <p>${escapeHtml(event.timestamp || "")}${event.tool ? ` - ${escapeHtml(event.tool)}` : ""}</p>
    `;
    root.append(card);
  }
}

function mergeTimelineEvents(events) {
  const byKey = new Map(state.sellerTimelineEvents.map((event) => [timelineKey(event), event]));
  const existingKeys = new Set(byKey.keys());
  for (const event of events || []) {
    const key = timelineKey(event);
    byKey.set(key, event);
    if (!existingKeys.has(key)) {
      productEventFromTimeline(event, key);
    }
  }
  state.sellerTimelineEvents = [...byKey.values()]
    .sort((left, right) => String(left.timestamp || "").localeCompare(String(right.timestamp || "")))
    .slice(-120);
  renderSellerTimeline();
}

async function refreshSellerTimeline() {
  const sessionId = encodeURIComponent(liveSessionId());
  const runtime = await fetchJson(
    `/api/seller-timeline/events?after=${state.sellerTimelineRuntimeCursor}&sessionId=${sessionId}`
  );
  state.sellerTimelineRuntimeCursor = runtime.nextCursor ?? state.sellerTimelineRuntimeCursor;
  mergeTimelineEvents(runtime.events || []);
  try {
    const response = await fetchOperatorJson(`/api/operator/events?after=${state.sellerTimelineOperatorCursor}`);
    state.sellerTimelineOperatorCursor = response.nextCursor ?? state.sellerTimelineOperatorCursor;
    mergeTimelineEvents(response.events || []);
  } catch (error) {
    mergeTimelineEvents([{
      id: `operator-timeline-offline-${Date.now()}`,
      timestamp: new Date().toISOString(),
      service: "operator",
      kind: "operator",
      status: "warning",
      title: "Operator timeline unavailable",
      detail: error instanceof Error ? error.message : String(error),
      redacted: true
    }]);
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

function publishableItems() {
  return currentItems().filter((item) =>
    item.decision.status === "approved" || item.decision.status === "edited"
  );
}

function publishableProducts() {
  return publishableItems().map((item) => item.decision.editedProduct || item.product);
}

function liveLineupProducts() {
  const approvedProducts = publishableProducts();
  return approvedProducts.length > 0 ? approvedProducts : state.runtimeLiveSession?.products || [];
}

function resetLiveSessionState() {
  state.liveSessionRegistered = false;
  state.livestreamPrepared = false;
  state.overlayPipeStarted = false;
  state.shopeePreview = undefined;
  state.viewerUrl = "";
  state.realtimeToolCalls = [];
}

function renderLiveLineup() {
  const root = $("#live-product-lineup");
  if (!root) {
    return;
  }
  const items = publishableItems();
  const fallbackProducts = items.length === 0 ? state.runtimeLiveSession?.products || [] : [];
  root.replaceChildren();
  if (items.length === 0 && fallbackProducts.length === 0) {
    root.textContent = "No products loaded for this live session yet.";
    return;
  }
  const products = items.length > 0
    ? items.map((item) => item.decision.editedProduct || item.product)
    : fallbackProducts;
  for (const product of products) {
    const image = product.media?.images?.[0];
    const row = document.createElement("article");
    row.className = "lineup-item";
    row.innerHTML = `
      ${image ? `<img src="${escapeHtml(image.uri)}" alt="${escapeHtml(image.alt || product.title)}" />` : "<span></span>"}
      <div>
        <strong>${escapeHtml(product.title)}</strong>
        <span>${escapeHtml(product.currency)} ${Number(product.price).toFixed(2)} · ${escapeHtml(product.stock)} in stock</span>
      </div>
      <button type="button" data-live-product-id="${escapeHtml(product.id)}">Show</button>
    `;
    root.append(row);
  }
}

async function showLiveProduct(productId) {
  const product = liveLineupProducts().find((candidate) => candidate.id === productId);
  if (!product) {
    throw new Error(`Unknown live product ${productId}`);
  }
  appendLiveEvent("Product overlay requested", product.title, "info", {
    tool: "show_product_card",
    productId
  });
  await callRealtimeTool("show_product_card", { productId });
  await callRealtimeTool("prompt_seller_script", { productId });
  appendLiveEvent("Product overlay changed", product.title, "success", {
    tool: "show_product_card",
    productId
  });
}

function renderAiOverlaySummary() {
  const root = $("#ai-overlay-summary");
  if (!root) {
    return;
  }
  root.replaceChildren();
  if (state.realtimeToolCalls.length === 0) {
    root.textContent = "No AI overlay action yet.";
    return;
  }
  for (const call of state.realtimeToolCalls.slice(-4).reverse()) {
    const card = document.createElement("article");
    card.className = "suggestion-card";
    card.innerHTML = `
      <span class="tag">${escapeHtml(call.tool || call.name || "tool")}</span>
      <strong>${escapeHtml(call.title || "AI action applied")}</strong>
      <p>${escapeHtml(call.detail || "")}</p>
    `;
    root.append(card);
  }
}

function renderLivePreview() {
  const frame = $("#live-camera-frame");
  const placeholder = $("#live-preview-placeholder");
  const previewStatus = $("#live-preview-status");
  const agentStatus = $("#live-agent-status");
  const viewerUrl = sellerViewerUrl();
  const products = liveLineupProducts();
  const previewUrl = cameraPreviewUrl();

  $("#viewer-url").value = viewerUrl;
  $("#viewer-url-status").textContent = viewerUrl
    ? "Share this after Shopee confirms the room is live."
    : "Prepare Shopee Live to get the viewer link.";
  agentStatus.textContent = state.realtimeAgentConnected ? "AI listening" : state.liveSessionRegistered ? "AI ready" : "AI idle";

  if (frame.getAttribute("src") !== previewUrl) {
    frame.setAttribute("src", previewUrl);
  }
  frame.hidden = false;
  placeholder.hidden = true;
  if (products.length === 0) {
    previewStatus.textContent = "Camera preview ready. Load a live session or approve products to add overlays.";
    return;
  }

  previewStatus.textContent = state.shopeePreview?.rtmpUrlPresent
    ? "Camera preview ready. Stream publisher can send this camera plus overlay feed to Shopee."
    : "Camera preview ready. Capture Shopee preview to connect RTMP.";
}

async function ensureLiveSessionReady() {
  if (!state.runtimeLiveSession) {
    await loadRuntimeLiveSessionSpec();
  }
  await registerApprovedLiveSession();
}

async function loadRuntimeLiveSessionSpec() {
  try {
    state.runtimeLiveSession = await fetchJson(`/api/live-sessions/${encodeURIComponent(liveSessionId())}/spec`);
  } catch (error) {
    state.runtimeLiveSession = undefined;
    writeLog("#livestream-log", {
      status: "live_session_fixture_unavailable",
      sessionId: liveSessionId(),
      error: error instanceof Error ? error.message : String(error)
    });
  }
  renderLiveLineup();
  renderLivePreview();
}

function updateLaunchChecklist() {
  const hasLiveProducts = liveLineupProducts().length > 0;
  const checks = {
    "approved-products": allProductsApproved() || hasLiveProducts,
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
  $("#prepare-livestream").disabled = !hasLiveProducts;
  $("#go-live").disabled = !hasLiveProducts;
  $("#start-overlay-pipe").disabled = false;
  renderLiveLineup();
  renderLivePreview();
  renderAiOverlaySummary();
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

function buildLocalCreateProductCommand(item, decision) {
  const product = decision.editedProduct || item.product;
  return {
    commandId: `cmd-create-${liveSessionId()}-${item.productId}`,
    sessionId: liveSessionId(),
    productId: item.productId,
    kind: "create_product",
    createdAt: new Date().toISOString(),
    approvalDecisionId: decision.decisionId,
    approvalStatus: decision.status === "edited" ? "edited" : "approved",
    payload: { product },
    citations: product.evidence
  };
}

async function registerApprovedLiveSession() {
  const baseSession = await fetchJson(`/api/live-sessions/${encodeURIComponent(reviewSessionId())}/spec`);
  const approvedProducts = publishableProducts();
  const products = approvedProducts.length > 0 ? approvedProducts : baseSession.products || [];
  if (products.length === 0) {
    throw new Error("Load a live session or approve at least one product before starting live preview.");
  }
  const session = {
    ...baseSession,
    sessionId: liveSessionId(),
    title: approvedProducts.length > 0 ? `${products[0]?.title || "LiveSeller"} Live` : baseSession.title,
    products,
    promos: (baseSession.promos || []).filter((promo) =>
      promo.eligibleProductIds?.some((productId) => products.some((product) => product.id === productId))
    ),
    retrievalRefs: []
  };
  const registered = await fetchJson("/api/live-sessions", {
    method: "POST",
    body: JSON.stringify({ session })
  });
  state.liveSessionRegistered = true;
  state.runtimeLiveSession = session;
  state.startLivestreamCommands = state.startLivestreamCommands.length > 0
    ? state.startLivestreamCommands
    : [{
        commandId: `cmd-prepare-${session.sessionId}`,
        sessionId: session.sessionId,
        kind: "prepare_livestream",
        safetyMode: "create_session_capture_credentials",
        payload: {
          title: session.title,
          productIds: products.map((product) => product.id),
          publicOverlayUrl: publicOverlayUrl(),
          credentialEvidence: "redacted_presence_only",
          goLive: false
        }
      }];
  appendLiveEvent("Live session registered", `${registered.productCount} product(s) ready`, "success", {
    sessionId: registered.sessionId,
    publicOverlayUrl: publicOverlayUrl(),
    cameraPreviewUrl: cameraPreviewUrl()
  });
  updateLaunchChecklist();
  return registered;
}

function renderReviewPlan() {
  const items = currentItems();
  const pendingItems = items.filter((item) =>
    item.decision.status !== "approved" && item.decision.status !== "edited" && item.decision.status !== "rejected"
  );
  $("#liveseller-prep-review").toggleAttribute("hidden", items.length === 0);
  $("#review-status").textContent = state.reviewPlan
    ? `${state.reviewPlan.status} - ${items.length} products`
    : "No review plan loaded.";
  const canApproveAll = Boolean(state.reviewPlan && pendingItems.length > 0);
  $("#approve-all-sticky").disabled = !canApproveAll;
  $("#approve-all-sticky-bar").toggleAttribute("hidden", !canApproveAll);
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
      <label>Request changes <textarea data-field="seller-request" rows="2" placeholder="Example: make the title shorter or suggest a cleaner cover image"></textarea></label>
      <div class="button-row">
        <button data-action="request-changes" type="button">Request changes</button>
        <button data-action="reject" type="button">Reject</button>
      </div>
    `;
    card.querySelector("[data-action='request-changes']").addEventListener("click", () =>
      void requestPlanChanges(card, item).catch((error) => writeLog("#operator-result-log", error.message))
    );
    card.querySelector("[data-action='reject']").addEventListener("click", () =>
      void submitDecision(card, item, "rejected")
    );
    root.append(card);
  }
}

async function requestPlanChanges(card, item) {
  if (state.reviewPlanSource !== "operator" || !state.reviewPlan) {
    writeLog("#intake-log", "Request changes is available after Codex app-server generates the product plan.");
    return;
  }
  const sellerText = card.querySelector("[data-field='seller-request']").value.trim();
  if (!sellerText) {
    writeLog("#operator-result-log", "Type the change you want Codex to make.");
    return;
  }
  $("#product-step-status").textContent = "Codex app-server is updating the product plan...";
  const result = await fetchOperatorJson("/api/operator/seller-review-turn", {
    method: "POST",
    body: JSON.stringify({
      reviewPlan: state.reviewPlan,
      createProductCommands: state.createProductCommands,
      productId: item.productId,
      sellerText
    })
  });
  applyOperatorResult(result);
  $("#product-step-status").textContent = "Updated product plan ready. Edit, request another change, or approve for Shopee.";
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
  writeLog("#intake-log", {
    status: "images_ready_for_processing",
    imageCount: intakeImages.length,
    source: "extension_side_panel_drag_drop",
    requiresSellerApproval: true
  });
}

function generatedDraftFields() {
  const primary = intakeImages[0];
  const title = $("#intake-product-name").value.trim() || inferProductName(primary?.name || "New Product");
  return {
    title,
    category: $("#intake-category").value.trim() || "Fashion Accessories",
    price: Number($("#intake-price").value || 19.9),
    stock: Number.parseInt($("#intake-stock").value || "20", 10),
    description: $("#intake-description").value.trim() ||
      `Seller-supplied image draft for ${title}. Verify exact product condition, variants, price, and stock before approving.`
  };
}

function writeDraftFields(fields) {
  $("#intake-product-name").value = fields.title || "";
  $("#intake-category").value = fields.category || "";
  $("#intake-price").value = fields.price ? String(fields.price) : "";
  $("#intake-stock").value = fields.stock ? String(fields.stock) : "";
  $("#intake-description").value = fields.description || "";
}

function addIntakeFiles(files) {
  const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
  writeDraftFields({});
  state.reviewPlan = undefined;
  state.reviewPlanSource = undefined;
  state.intakeReviewItems = [];
  state.createProductCommands = [];
  state.startLivestreamCommands = [];
  resetLiveSessionState();
  state.queuedProductCreation = [];
  state.productCreationFilled = false;
  appendProductEvent("Images loaded", `${images.length} image(s) ready for generation.`);
  intakeImages.push(...images.map((file) => ({
    file,
    name: file.name,
    type: file.type,
    url: URL.createObjectURL(file)
  })));
  fillIntakeDraft();
  renderIntake();
  renderReviewPlan();
  renderCommands();
  $("#product-step-status").textContent = "Images ready. Create a review draft to prepare the product plan.";
}

function readImageDataUrl(image) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error(`Could not read ${image.name}`)));
    reader.readAsDataURL(image.file);
  });
}

function buildSidepanelProduct(productId, image, imageDataUrl, index) {
  const now = new Date().toISOString();
  const title = `Uploaded product ${index + 1}`;
  return {
    id: productId,
    title,
    sku: `SIDE-${Date.now()}-${index + 1}`,
    aliases: [title],
    category: "Seller review required",
    price: 19.9,
    currency: "SGD",
    variants: [],
    stock: 20,
    dimensions: {
      weightGrams: 100,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 5
    },
    shipping: {
      originCountry: "SG",
      shipWithinDays: 2,
      supportedMethods: ["Shopee Standard"],
      freeShipping: false
    },
    returnPolicy: {
      windowDays: 7,
      conditions: ["Unused", "Original condition"],
      exclusions: ["Seller to verify category-specific exclusions before publishing"]
    },
    description: "Pending Codex app-server generation from uploaded product image.",
    evidence: [{
      sourceId: "extension-sidepanel-intake",
      sourceType: "image",
      locator: image.name,
      excerpt: "Seller dragged this product image into the Chrome extension side panel for server-side generation.",
      confidence: 0.75
    }],
    sourceConfidence: 0.75,
    listingDraft: {
      title,
      description: "Pending Codex app-server generation from uploaded product image.",
      bulletPoints: [
        "Pending server-generated seller review"
      ]
    },
    media: {
      images: [{
        id: `${productId}-image-${index}`,
        uri: imageDataUrl,
        alt: image.name,
        citations: [{
          sourceId: "extension-sidepanel-intake",
          sourceType: "image",
          locator: image.name,
          excerpt: `Seller supplied product photo copied from side-panel file: ${image.name}`,
          confidence: 0.75
        }]
      }]
    }
  };
}

function localReviewItemFromProduct(product, now = new Date().toISOString()) {
  const item = {
    localOnly: true,
    createdAt: now,
    reviewItemId: `review-${product.id}`,
    productId: product.id,
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
  return item;
}

function createLocalIntakeReviewDraft(product, draft) {
  const item = localReviewItemFromProduct(product);
  state.intakeReviewItems = [item, ...state.intakeReviewItems];
  state.createProductCommands = [];
  state.startLivestreamCommands = [];
  resetLiveSessionState();
  writeCachedPlan({
    cachedAt: new Date().toISOString(),
    item,
    fields: draft
  });
  renderReviewPlan();
  renderCommands();
  renderLiveLineup();
  writeLog("#intake-log", {
    status: "Draft ready for review",
    productId,
    imageCount: intakeImages.length,
    note: "Approve the plan to queue a Shopee product creation action."
  });
  $("#product-step-status").textContent = "Draft ready for review. Edit details or approve to create the Shopee listing.";
}

async function createIntakeReviewDraft() {
  $("#product-step-status").textContent = "Codex app-server is processing product photos into a reviewable plan...";
  $("#create-intake-review").disabled = true;
  $("#create-intake-review").textContent = "Processing...";
  appendProductEvent("Generation started", `Sending ${intakeImages.length} image(s) to Codex app-server.`);
  writeDraftFields({});
  const startedAt = Date.now();
  try {
    const imagePayloads = await Promise.all(intakeImages.map(async (image) => ({
      name: image.name,
      type: image.type || "image/jpeg",
      dataUrl: await readImageDataUrl(image)
    })));
    const products = intakeImages.map((image, index) =>
      buildSidepanelProduct(`sidepanel-${startedAt}-${index + 1}`, image, imagePayloads[index].dataUrl, index)
    );
    const response = await fetchOperatorJson("/api/operator/sidepanel-draft", {
      method: "POST",
      body: JSON.stringify({
        sessionId: liveSessionId(),
        products,
        images: imagePayloads
      })
    });
    state.reviewPlan = response.reviewPlan;
    state.reviewPlanSource = "operator";
    state.intakeReviewItems = [];
    state.createProductCommands = response.createProductCommands || [];
    state.startLivestreamCommands = response.startLivestreamCommands || [];
    resetLiveSessionState();
    writeCachedPlan({
      cachedAt: new Date().toISOString(),
      reviewPlan: state.reviewPlan,
      source: "operator"
    });
    renderReviewPlan();
    renderCommands();
    renderLiveLineup();
    writeLog("#intake-log", {
      status: "operator_review_plan_created",
      reviewPlanId: state.reviewPlan?.reviewPlanId,
      productIds: state.reviewPlan?.items?.map((item) => item.productId),
      imageCount: intakeImages.length,
      note: "Approve the app-server review plan to let Codex build create_product commands."
    });
    appendProductEvent("Product plan generated", `${state.reviewPlan?.items?.length || 0} product plan(s) returned.`, "success");
    $("#product-step-status").textContent = `Codex app-server generated ${state.reviewPlan?.items?.length || 0} product plan(s). Edit or approve for Shopee.`;
  } catch (error) {
    state.reviewPlan = undefined;
    state.reviewPlanSource = undefined;
    state.intakeReviewItems = [];
    state.createProductCommands = [];
    state.startLivestreamCommands = [];
    resetLiveSessionState();
    renderReviewPlan();
    renderCommands();
    appendProductEvent("Generation failed", error instanceof Error ? error.message : String(error), "error");
    writeLog("#intake-log", {
      status: "operator_generation_failed",
      error: error instanceof Error ? error.message : String(error),
      note: "Start the Codex operator app-server on the configured origin and retry."
    });
    $("#product-step-status").textContent = "Codex app-server could not create the draft. Start the operator app-server and try again.";
  }
  $("#create-intake-review").textContent = "Generate product plan";
  $("#create-intake-review").disabled = intakeImages.length === 0;
}

function loadCachedPlan() {
  const raw = localStorage.getItem(cachedPlanStorageKey);
  if (!raw) {
    $("#product-step-status").textContent = "No cached product plan yet. Drop images and create a review draft first.";
    return;
  }
  let cached;
  try {
    cached = JSON.parse(raw);
  } catch (error) {
    $("#product-step-status").textContent = "Cached product plan is invalid. Create a new review draft.";
    writeLog("#intake-log", {
      status: "cached_plan_invalid",
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }
  if (cached.fields) {
    writeDraftFields(cached.fields);
  }
  if (cached.item) {
    state.intakeReviewItems = [cached.item, ...state.intakeReviewItems.filter((item) => item.productId !== cached.item.productId)];
  }
  if (cached.reviewPlan) {
    state.reviewPlan = cached.reviewPlan;
    state.reviewPlanSource = cached.source || "operator";
  }
  resetLiveSessionState();
  renderReviewPlan();
  renderCommands();
  renderLiveLineup();
  $("#product-step-status").textContent = "Cached product plan loaded. Review, edit, or approve it for Shopee.";
  writeLog("#intake-log", {
    status: "cached_plan_loaded",
    cachedAt: cached.cachedAt,
    productId: cached.item?.productId
  });
}

function clearIntake() {
  for (const image of intakeImages) {
    URL.revokeObjectURL(image.url);
  }
  intakeImages = [];
  writeDraftFields({});
  resetLiveSessionState();
  state.queuedProductCreation = [];
  state.productCreationFilled = false;
  renderIntake();
  renderCommands();
  appendProductEvent("Product flow cleared", "Upload images to start again.");
  $("#product-step-status").textContent = "Drop images, generate a product plan, then approve when it is ready for Shopee.";
  writeLog("#intake-log", "Drop images to begin.");
}

function renderCommands() {
  $("#command-status-panel").toggleAttribute("hidden", state.createProductCommands.length === 0);
  $("#shopee-publish-panel").toggleAttribute("hidden", state.createProductCommands.length === 0);
  $("#execute-create-products").disabled = state.createProductCommands.length === 0;
  $("#queue-shopee-product-creation").disabled = state.createProductCommands.length === 0;
  $("#confirm-shopee-product-publish").disabled = !state.productCreationFilled;
  $("#prepare-livestream").disabled = publishableProducts().length === 0;
  $("#start-overlay-pipe").disabled = false;
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
  state.reviewPlanSource = "runtime";
  state.createProductCommands = [];
  state.startLivestreamCommands = [];
  state.createProductExecuted = false;
  resetLiveSessionState();
  renderReviewPlan();
  renderCommands();
  renderLiveLineup();
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
    if (decision.status === "approved" || decision.status === "edited") {
      const command = buildLocalCreateProductCommand(item, decision);
      state.createProductCommands = [
        command,
        ...state.createProductCommands.filter((candidate) => candidate.productId !== item.productId)
      ];
      state.queuedProductCreation = [];
      state.productCreationFilled = false;
    } else {
      state.createProductCommands = state.createProductCommands.filter((command) => command.productId !== item.productId);
      state.queuedProductCreation = state.queuedProductCreation.filter((command) => command.productId !== item.productId);
      state.productCreationFilled = state.queuedProductCreation.length > 0;
    }
    renderReviewPlan();
    renderCommands();
    writeLog("#intake-log", {
      status: "local_review_decision_recorded",
      productId: item.productId,
      decision: decision.status,
      createProductCommands: state.createProductCommands
        .filter((command) => command.productId === item.productId)
        .map((command) => command.commandId),
      note: "Approved side-panel image drafts now queue create_product commands for the authenticated Shopee seller tab."
    });
    return;
  }
  if (state.reviewPlanSource === "operator") {
    const response = await fetchOperatorJson("/api/operator/review-tools", {
      method: "POST",
      body: JSON.stringify({
        reviewPlan: state.reviewPlan,
        createProductCommands: state.createProductCommands,
        calls: [
          {
            tool: "liveseller_record_product_review_decision",
            arguments: { decision }
          },
          {
            tool: "liveseller_build_create_product_commands",
            arguments: {}
          }
        ]
      })
    });
    state.reviewPlan = response.reviewPlan;
    state.createProductCommands = response.createProductCommands || [];
    state.startLivestreamCommands = response.startLivestreamCommands || [];
    resetLiveSessionState();
    state.queuedProductCreation = [];
    state.productCreationFilled = false;
    renderReviewPlan();
    renderCommands();
    writeLog("#operator-result-log", {
      status: "operator_approval_recorded",
      createProductCommandCount: state.createProductCommands.length,
      productId: decision.productId
    });
    appendProductEvent("Product approved", `${decision.productId}; ${state.createProductCommands.length} create command(s) ready.`, "success");
    void queueShopeeProductCreation({ autoSubmit: true, prepareLive: true }).catch((error) => writeLog("#product-creation-log", error.message));
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
  resetLiveSessionState();
  state.queuedProductCreation = [];
  state.productCreationFilled = false;
  renderReviewPlan();
  renderCommands();
  if (decision.status === "approved" || decision.status === "edited") {
    void queueShopeeProductCreation({ autoSubmit: true, prepareLive: true }).catch((error) => writeLog("#product-creation-log", error.message));
  }
}

async function approveAll() {
  const pending = currentItems().filter((item) =>
    item.decision.status !== "approved" && item.decision.status !== "edited" && item.decision.status !== "rejected"
  );
  if (pending.length === 0) {
    appendProductEvent("Approve all skipped", "No pending products to approve.");
    return;
  }
  appendProductEvent("Approve all started", `${pending.length} product(s) sent to Codex operator.`);

  if (state.reviewPlanSource === "operator" && state.reviewPlan) {
    const decisions = pending.map((item) => {
      const card = document.querySelector(`[data-product-id="${item.productId}"]`);
      return buildDecision(card, item, "approved");
    });
    const calls = decisions.flatMap((decision) => [
      {
        tool: "liveseller_record_product_review_decision",
        arguments: { decision }
      }
    ]);
    calls.push({
      tool: "liveseller_build_create_product_commands",
      arguments: {}
    });
    const response = await fetchOperatorJson("/api/operator/review-tools", {
      method: "POST",
      body: JSON.stringify({
        reviewPlan: state.reviewPlan,
        createProductCommands: state.createProductCommands,
        calls
      })
    });
    state.reviewPlan = response.reviewPlan;
    state.reviewPlanSource = "operator";
    state.createProductCommands = response.createProductCommands || [];
    state.startLivestreamCommands = response.startLivestreamCommands || [];
    resetLiveSessionState();
    state.queuedProductCreation = [];
    state.productCreationFilled = false;
    renderReviewPlan();
    renderCommands();
    appendProductEvent("Approve all complete", `${state.createProductCommands.length} Shopee create command(s) ready.`, "success");
    await queueShopeeProductCreation({ autoSubmit: true, continueQueue: true, prepareLive: true });
    return;
  }

  for (const item of pending) {
    const latest = currentItems().find((candidate) => candidate.productId === item.productId);
    const card = latest ? document.querySelector(`[data-product-id="${latest.productId}"]`) : undefined;
    if (latest && card) {
      await submitDecision(card, latest, "approved");
    }
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
  void refreshSellerTimeline().catch(() => undefined);
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
  if (!state.liveSessionRegistered && publishableProducts().length > 0) {
    await registerApprovedLiveSession();
  }
  const response = await fetchJson("/api/runtime/realtime/agent-session", {
    method: "POST",
    body: JSON.stringify({
      sessionId: liveSessionId(),
      voice: "marin"
    })
  });
  const sdkResult = await connectOpenAiRealtimeAgent(response);
  writeLog("#realtime-log", {
    status: sdkResult.connected ? "openai_realtime_agent_connected" : "openai_realtime_agent_session_ready",
    clientSecretPresent: Boolean(response.client_secret || response.value),
    agent: response.agent,
    sdk: sdkResult,
    note: "Connected with @openai/agents/realtime using a server-minted ephemeral client secret."
  });
  void refreshSellerTimeline().catch(() => undefined);
  return response;
}

function realtimeClientSecret(response) {
  return response.value ||
    response.client_secret?.value ||
    response.client_secret ||
    response.ephemeralKey ||
    response.secret;
}

async function connectOpenAiRealtimeAgent(response) {
  const secret = realtimeClientSecret(response);
  if (!secret) {
    return {
      connected: false,
      reason: "missing_ephemeral_client_secret"
    };
  }

  try {
    const {
      RealtimeAgent,
      RealtimeSession,
      tool
    } = await import("./node_modules/@openai/agents-realtime/dist/bundle/openai-realtime-agents.mjs");
    const overlayTool = tool({
      name: "show_overlay_background",
      description: "Change the public livestream overlay background after the seller asks for a visual change.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["solid", "default"] },
          value: { type: "string" },
          label: { type: "string" }
        },
        required: ["mode", "value"],
        additionalProperties: false
      },
      strict: true,
      execute: async (input) => callRealtimeTool("show_overlay_background", {
        mode: input.mode,
        value: input.value,
        label: input.label || "Realtime agent background"
      })
    });
    const productTool = tool({
      name: "show_product_card",
      description: "Switch the live overlay to one of the approved products in this session.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" }
        },
        required: ["productId"],
        additionalProperties: false
      },
      strict: true,
      execute: async (input) => callRealtimeTool("show_product_card", {
        productId: input.productId
      })
    });
    const scriptTool = tool({
      name: "prompt_seller_script",
      description: "Generate a seller-only talk track from structured product facts.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" }
        },
        required: [],
        additionalProperties: false
      },
      strict: true,
      execute: async (input) => callRealtimeTool("prompt_seller_script", {
        productId: input.productId
      })
    });
    const replyTool = tool({
      name: "send_policy_checked_reply",
      description: "Ask LiveSeller runtime to policy-check a viewer reply before any public send action.",
      parameters: {
        type: "object",
        properties: {
          viewerId: { type: "string" },
          viewerName: { type: "string" },
          text: { type: "string" },
          language: { type: "string", enum: ["en", "zh", "ms", "ta"] }
        },
        required: ["viewerId", "text"],
        additionalProperties: false
      },
      strict: true,
      execute: async (input) => callRealtimeTool("send_policy_checked_reply", {
        viewerId: input.viewerId,
        viewerName: input.viewerName || "Shopee Viewer",
        text: input.text,
        language: input.language || "en"
      })
    });
    const agent = new RealtimeAgent({
      name: response.agent?.name || "LiveSeller Realtime Copilot",
      voice: "marin",
      instructions: [
        "You are the LiveSeller seller-private realtime copilot.",
        "Listen to the seller's speech, prompt concise product talk tracks, and translate requested Chinese host speech into English audio.",
        "Use tools for product overlay changes, generated background changes, seller prompts, and policy-checked viewer replies. Do not invent discounts, stock, refund commitments, or legal claims."
      ].join(" "),
      tools: [overlayTool, productTool, scriptTool, replyTool]
    });
    const session = new RealtimeSession(agent, {
      transport: "webrtc",
      model: response.session?.model || DEFAULT_REALTIME_MODEL,
      config: {
        audio: response.session?.audio
      }
    });
    session.on("history_added", () => {
      state.realtimeAgentConnected = true;
    });
    session.on("error", (event) => {
      writeLog("#realtime-log", {
        status: "openai_realtime_agent_error",
        message: event?.message || String(event)
      });
    });
    await session.connect({ apiKey: secret });
    globalThis.livesellerRealtimeAgentSession?.close?.();
    globalThis.livesellerRealtimeAgentSession = session;
    state.realtimeAgentConnected = true;
    return {
      connected: true,
      sdk: "@openai/agents/realtime",
      transport: "webrtc",
      model: response.session?.model || DEFAULT_REALTIME_MODEL,
      tools: ["show_overlay_background", "show_product_card", "prompt_seller_script", "send_policy_checked_reply"]
    };
  } catch (error) {
    state.realtimeAgentConnected = false;
    return {
      connected: false,
      sdk: "@openai/agents/realtime",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
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

async function prepareLivestream() {
  $("#prepare-livestream").disabled = true;
  $("#prepare-livestream").textContent = "Preparing...";
  appendLiveEvent("Prepare live started", "Loading products, overlay, Shopee preview, and voice copilot.", "info");
  try {
    await ensureLiveSessionReady();
  } catch (error) {
    appendLiveEvent("Live session registration failed", error instanceof Error ? error.message : String(error), "error", {
      note: "Restart the runtime server with live-session registration support and retry."
    });
  }
  state.livestreamPrepared = true;
  state.overlayOpened = true;
  updateLaunchChecklist();
  renderLivePreview();
  appendLiveEvent("Seller preview ready", "Camera compositor and public overlay URLs are ready.", "success", {
    cameraPreviewUrl: cameraPreviewUrl(),
    publicOverlayUrl: publicOverlayUrl(),
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
  try {
    await aiPrepareShopeePreview();
  } catch (error) {
    appendLiveEvent("Shopee preview capture pending", error instanceof Error ? error.message : String(error), "warning", {
      cameraPreviewUrl: cameraPreviewUrl()
    });
  }
  try {
    await startRealtimeAgent();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLiveEvent("Realtime voice copilot not connected", message, "warning");
    writeLog("#realtime-log", message);
  }
  $("#prepare-livestream").textContent = "Prepare live";
  $("#prepare-livestream").disabled = liveLineupProducts().length === 0;
  void refreshSellerTimeline().catch(() => undefined);
}

async function aiPrepareShopeePreview() {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    appendLiveEvent("Shopee preview capture unavailable", "Chrome extension runtime is required for Shopee UI automation.", "warning");
    return;
  }

  appendLiveEvent("Shopee preview capture started", "Extension is looking for preview URL plus RTMP URL/key.", "info");
  const response = await chrome.runtime.sendMessage({ type: "liveseller:prepare-shopee-test-preview" });
  if (!response?.ok) {
    state.shopeePreview = undefined;
    $("#start-overlay-pipe").disabled = true;
    updateLaunchChecklist();
    appendLiveEvent("Shopee preview not ready", response?.error || response?.status || "Preview credentials not found yet.", "warning", {
      previewUrl: response?.previewUrl,
      rtmpUrlPresent: Boolean(response?.rtmpUrlPresent),
      rtmpKeyPresent: Boolean(response?.rtmpKeyPresent),
      goLiveVisible: Boolean(response?.goLiveVisible),
      goLivePressed: false
    });
    return;
  }

  state.shopeePreview = response;
  state.viewerUrl = response.previewUrl || state.viewerUrl;
  state.overlayPipeStarted = false;
  $("#start-overlay-pipe").disabled = false;
  updateLaunchChecklist();
  appendLiveEvent("Shopee preview ready", "RTMP URL/key captured and redacted in logs.", "success", {
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
    if (!state.liveSessionRegistered) {
      await ensureLiveSessionReady();
    }
    state.overlayPipeStarted = false;
    renderLivePreview();
    updateLaunchChecklist();
    writeLog("#camera-status-log", {
      status: "seller_camera_preview_open",
      cameraPreviewUrl: cameraPreviewUrl(),
      publicOverlayUrl: publicOverlayUrl(),
      note: "Shopee RTMP and stream key are not captured yet. Prepare Shopee preview to start the publisher."
    });
    return;
  }
  appendLiveEvent("Stream publisher starting", "Runtime compositor will pipe camera plus overlay to Shopee RTMP.", "info", {
    rtmpUrl: "present_redacted",
    rtmpKey: "present_redacted"
  });
  const response = await fetchJson("/api/shopee/runtime-compositor/start", {
    method: "POST",
    body: JSON.stringify({
      rtmpUrl: state.shopeePreview.rtmpUrl,
      rtmpKey: state.shopeePreview.rtmpKey,
      overlayUrl: publicOverlayUrl(),
      sellerPreviewUrl: cameraPreviewUrl(),
      cameraInputKind: "avfoundation",
      cameraInput: "0",
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
  appendLiveEvent("Stream publisher started", "Camera plus overlay is being sent to Shopee preview.", "success", {
    rtmpUrl: "present_redacted",
    rtmpKey: "present_redacted",
    sellerPreviewUrl: cameraPreviewUrl()
  });
  void refreshSellerTimeline().catch(() => undefined);
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
  void refreshSellerTimeline().catch(() => undefined);
}

async function callRealtimeTool(name, args) {
  const result = await fetchJson("/api/runtime/realtime/tool-call", {
    method: "POST",
    body: JSON.stringify({
      sessionId: liveSessionId(),
      callId: `sidepanel-${name}-${Date.now()}`,
      name,
      arguments: args
    })
  });
  state.realtimeToolCalls.push({
    tool: result.tool || name,
    title: name === "show_overlay_background"
      ? "Background changed"
      : name === "show_product_card"
        ? "Product overlay changed"
        : name === "prompt_seller_script"
          ? "Seller prompt generated"
          : "Viewer reply checked",
    detail: result.scriptSuggestion?.script ||
      result.routed?.actions?.[0]?.reason ||
      result.overlayState?.background?.label ||
      result.overlayState?.productCard?.title ||
      "Applied by runtime."
  });
  appendLiveEvent("Realtime tool called", result.scriptSuggestion?.script ||
    result.routed?.actions?.[0]?.reason ||
    result.overlayState?.background?.label ||
    result.overlayState?.productCard?.title ||
    "Applied by runtime.", "success", {
    tool: result.tool || name,
    arguments: args
  });
  if (result.routed?.actions) {
    state.latestActions = result.routed.actions;
    renderSuggestions(state.latestActions);
  }
  renderAiOverlaySummary();
  void refreshSellerTimeline().catch(() => undefined);
  return result;
}

async function applyOverlayBackground() {
  if (!state.liveSessionRegistered) {
    await ensureLiveSessionReady();
  }
  const product = liveLineupProducts()[0];
  const response = await callRealtimeTool("show_overlay_background", {
    mode: "solid",
    value: "#ee4d2d",
    label: product ? `AI generated Shopee-orange backdrop for ${product.title}` : "AI generated live backdrop"
  });
  writeLog("#overlay-background-log", {
    status: "ai_overlay_tool_applied",
    tool: response.tool,
    background: response.overlayState?.background
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

async function queueShopeeProductCreation(options = {}) {
  const approvedCommands = state.createProductCommands.filter((command) =>
    command.kind === "create_product" &&
    (command.approvalStatus === "approved" || command.approvalStatus === "edited")
  );
  if (approvedCommands.length === 0) {
    writeLog("#product-creation-log", "No approved create_product command is available.");
    appendProductEvent("Shopee creation skipped", "No approved create_product command is available.", "error");
    return;
  }
  const command = approvedCommands[0];
  appendProductEvent("Shopee fill started", command.payload?.product?.title || command.productId);
  state.queuedProductCreation = [{
    commandId: command.commandId,
    productId: command.productId,
    approvalStatus: command.approvalStatus,
    queuedAt: new Date().toISOString()
  }];
  state.productCreationFilled = false;
  if (globalThis.chrome?.runtime?.sendMessage) {
    const response = await chrome.runtime.sendMessage({
      type: "liveseller:queue-create-products",
      commands: [command]
    });
    state.productCreationFilled = Boolean(response?.ok);
    renderCommands();
    appendProductEvent(
      response?.ok ? "Shopee form filled" : "Shopee fill failed",
      response?.ok
        ? `${response.evidence?.filled?.join(", ") || "fields"}; images ${response.evidence?.uploadedImages?.count || 0}`
        : response?.error || response?.evidence?.error || response?.status || "Shopee did not accept the fill.",
      response?.ok ? "success" : "error"
    );
    writeLog("#product-creation-log", {
      status: response?.ok ? "filled_authenticated_shopee_product_form" : "queue_recorded_side_panel_only",
      commands: state.queuedProductCreation,
      remainingApprovedCommands: Math.max(approvedCommands.length - 1, 0),
      result: response
    });
    if (response?.ok && options.autoSubmit) {
      await confirmShopeeProductPublish({
        continueQueue: options.continueQueue === true,
        prepareLive: options.prepareLive === true
      });
    }
    void refreshSellerTimeline().catch(() => undefined);
    return;
  }
  writeLog("#product-creation-log", {
    status: "queue_recorded_side_panel_only",
    commands: state.queuedProductCreation,
    remainingApprovedCommands: Math.max(approvedCommands.length - 1, 0),
    note: "Chrome extension runtime is required to execute inside an authenticated Shopee seller tab."
  });
  appendProductEvent("Shopee fill queued locally", "Chrome extension runtime is required to execute in the seller tab.", "error");
  renderCommands();
  void refreshSellerTimeline().catch(() => undefined);
}

async function confirmShopeeProductPublish(options = {}) {
  const queuedCommandIds = new Set(state.queuedProductCreation.map((command) => command.commandId));
  const approvedCommands = state.createProductCommands.filter((command) =>
    command.kind === "create_product" &&
    (command.approvalStatus === "approved" || command.approvalStatus === "edited") &&
    queuedCommandIds.has(command.commandId)
  );
  if (approvedCommands.length === 0) {
    writeLog("#product-creation-log", "Fill one approved Shopee product listing before confirming Save and Publish.");
    appendProductEvent("Publish skipped", "Fill one approved Shopee product listing before confirming Save and Publish.", "error");
    return;
  }
  if (!globalThis.chrome?.runtime?.sendMessage) {
    writeLog("#product-creation-log", "Chrome extension runtime is required to press Shopee Save and Publish.");
    appendProductEvent("Publish skipped", "Chrome extension runtime is required to press Shopee Save and Publish.", "error");
    return;
  }
  const response = await chrome.runtime.sendMessage({
    type: "liveseller:confirm-product-publish",
    commands: [approvedCommands[0]]
  });
  state.createProductExecuted = Boolean(response?.ok);
  if (response?.ok) {
    state.createProductCommands = state.createProductCommands.filter((command) =>
      command.commandId !== approvedCommands[0].commandId
    );
    state.productCreationFilled = false;
    state.queuedProductCreation = [];
  }
  updateLaunchChecklist();
  renderCommands();
  writeLog("#product-creation-log", {
    status: response?.ok ? "submitted_authenticated_shopee_product_form" : "product_publish_not_submitted",
    commands: [approvedCommands[0].commandId],
    result: response
  });
  appendProductEvent(
    response?.ok ? "Shopee product submitted" : "Shopee publish failed",
    response?.ok
      ? approvedCommands[0].payload?.product?.title || approvedCommands[0].productId
      : response?.error || response?.evidence?.error || response?.status || "Shopee did not click Save and Publish.",
    response?.ok ? "success" : "error"
  );
  if (response?.ok && options.continueQueue && state.createProductCommands.length > 0) {
    await queueShopeeProductCreation({ autoSubmit: true, continueQueue: true, prepareLive: options.prepareLive === true });
  } else if (response?.ok && options.prepareLive) {
    appendProductEvent("Shopee publish queue complete", "Registering approved products for livestream context.", "success");
    try {
      await registerApprovedLiveSession();
      appendProductEvent("Livestream product context ready", `${liveLineupProducts().length} product(s) loaded for overlays and scripts.`, "success");
    } catch (error) {
      appendProductEvent("Livestream context pending", error instanceof Error ? error.message : String(error), "warning");
    }
  }
  void refreshSellerTimeline().catch(() => undefined);
}

async function confirmShopeeGoLive() {
  appendLiveEvent("Go Live requested", "Preparing preview, publisher, realtime agent, then clicking Shopee Go Live when available.", "info");
  if (!state.livestreamPrepared) {
    await prepareLivestream();
  } else if (!state.liveSessionRegistered) {
    await ensureLiveSessionReady();
  }

  if (!state.shopeePreview?.rtmpUrlPresent) {
    await aiPrepareShopeePreview();
  }

  if (state.shopeePreview?.rtmpUrl && state.shopeePreview?.rtmpKey && !state.overlayPipeStarted) {
    await startOverlayPreviewPipe();
  }

  if (!state.realtimeAgentConnected) {
    await startRealtimeAgent().catch((error) => {
      appendLiveEvent("Realtime voice copilot not connected", error instanceof Error ? error.message : String(error), "warning");
    });
  }

  if (!globalThis.chrome?.runtime?.sendMessage) {
    appendLiveEvent("Shopee Go Live click unavailable", "Chrome extension runtime is required to press Shopee Go Live.", "warning", {
      viewerUrl: state.viewerUrl || state.shopeePreview?.previewUrl || "pending_from_shopee"
    });
    return;
  }
  const response = await chrome.runtime.sendMessage({
    type: "liveseller:confirm-go-live"
  });
  state.viewerUrl = response?.viewerUrl || state.shopeePreview?.previewUrl || state.viewerUrl;
  if (response?.ok && !state.viewerUrl) {
    state.viewerUrl = $("#shopee-live-url").value.trim();
  }
  renderLivePreview();
  appendLiveEvent(response?.ok ? "Shopee Go Live clicked" : "Shopee Go Live not clicked", response?.status || response?.error || "Shopee button not available yet.", response?.ok ? "success" : "warning", {
    viewerUrl: state.viewerUrl || "pending_from_shopee",
    result: response
  });
  void refreshSellerTimeline().catch(() => undefined);
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

function applyOperatorResult(result) {
  state.reviewPlan = result.reviewPlan || state.reviewPlan;
  state.reviewPlanSource = "operator";
  state.createProductCommands = result.createProductCommands || state.createProductCommands;
  renderReviewPlan();
  renderCommands();
  $("#codex-events-json").value = JSON.stringify({
    threadId: result.threadId,
    events: result.operatorEvents || []
  }, null, 2);
  renderCodexEvents();
  writeLog("#operator-result-log", {
    status: "operator_turn_applied",
    reviewPlanStatus: state.reviewPlan?.status,
    createProductCommandCount: state.createProductCommands.length,
    interpretedCalls: result.interpretedCalls,
    events: (result.operatorEvents || []).map((event) => ({
      type: event.type,
      tool: event.tool,
      message: event.message
    }))
  });
  void refreshSellerTimeline().catch(() => undefined);
}

function requireServerReviewPlan() {
  if (!state.reviewPlan) {
    throw new Error("Load a server-backed review plan before using the Codex operator.");
  }
  return state.reviewPlan;
}

async function requestCodexOperator() {
  const reviewPlan = requireServerReviewPlan();
  const result = await fetchOperatorJson("/api/operator/seller-review-turn", {
    method: "POST",
    body: JSON.stringify({
      reviewPlan,
      createProductCommands: state.createProductCommands,
      sellerText: $("#operator-seller-request").value.trim() || "Generate another image option."
    })
  });
  applyOperatorResult(result);
}

async function operatorGenerateImages() {
  const reviewPlan = requireServerReviewPlan();
  const result = await fetchOperatorJson("/api/operator/review-tools", {
    method: "POST",
    body: JSON.stringify({
      reviewPlan,
      createProductCommands: state.createProductCommands,
      calls: [{
        tool: "liveseller_generate_image_edits",
        arguments: {}
      }]
    })
  });
  applyOperatorResult(result);
}

async function operatorBuildCreateProducts() {
  const reviewPlan = requireServerReviewPlan();
  const result = await fetchOperatorJson("/api/operator/review-tools", {
    method: "POST",
    body: JSON.stringify({
      reviewPlan,
      createProductCommands: state.createProductCommands,
      calls: [{
        tool: "liveseller_build_create_product_commands",
        arguments: {}
      }]
    })
  });
  applyOperatorResult(result);
}

$("#load-review-plan").addEventListener("click", () => void loadReviewPlan().catch((error) => writeLog("#review-status", error.message)));
$("#toggle-settings").addEventListener("click", toggleSettingsPanel);
function handleApproveAllClick() {
  void approveAll().catch((error) => {
    appendProductEvent("Approve all failed", error instanceof Error ? error.message : String(error), "error");
    writeLog("#command-log", error instanceof Error ? error.message : String(error));
  });
}
$("#approve-all-sticky").addEventListener("click", handleApproveAllClick);
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
$("#load-cached-plan").addEventListener("click", loadCachedPlan);
$("#clear-intake").addEventListener("click", clearIntake);
$("#live-product-lineup").addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-live-product-id]") : undefined;
  const productId = button?.getAttribute("data-live-product-id");
  if (productId) {
    void showLiveProduct(productId).catch((error) => appendLiveEvent("Product overlay failed", error.message, "error", {
      productId
    }));
  }
});
$("#execute-create-products").addEventListener("click", executeCreateProducts);
$("#prepare-livestream").addEventListener("click", () => void prepareLivestream().catch((error) => writeLog("#livestream-log", error.message)));
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
$("#confirm-shopee-product-publish").addEventListener("click", () => void confirmShopeeProductPublish().catch((error) => writeLog("#product-creation-log", error.message)));
$("#go-live").addEventListener("click", () => void confirmShopeeGoLive().catch((error) => writeLog("#livestream-log", error.message)));
$("#send-host-caption").addEventListener("click", () => void sendHostCaption().catch((error) => writeLog("#realtime-log", error.message)));
$("#request-realtime-session").addEventListener("click", () => void requestRealtimeSession());
$("#start-realtime-agent").addEventListener("click", () => void startRealtimeAgent().catch((error) => writeLog("#realtime-log", error.message)));
$("#load-product-scripts").addEventListener("click", () => void loadProductScripts().catch((error) => writeLog("#script-suggestion-log", error.message)));
$("#use-captured-message").addEventListener("click", () => void useCapturedMessage());
$("#render-codex-events").addEventListener("click", renderCodexEvents);
$("#refresh-seller-timeline").addEventListener("click", () => void refreshSellerTimeline().catch((error) => writeLog("#seller-timeline-log", error.message)));
$("#request-codex-operator").addEventListener("click", () => void requestCodexOperator().catch((error) => writeLog("#operator-result-log", error.message)));
$("#operator-generate-images").addEventListener("click", () => void operatorGenerateImages().catch((error) => writeLog("#operator-result-log", error.message)));
$("#operator-build-create-products").addEventListener("click", () => void operatorBuildCreateProducts().catch((error) => writeLog("#operator-result-log", error.message)));
$("#live-session-id").addEventListener("change", () => void loadRuntimeLiveSessionSpec());
$("#review-session-id").addEventListener("change", () => void loadRuntimeLiveSessionSpec());
$("#runtime-origin").addEventListener("change", () => void loadRuntimeLiveSessionSpec());
document.querySelectorAll("[data-step-target]").forEach((button) => {
  button.addEventListener("click", () => setActiveStep(button.getAttribute("data-step-target")));
});

void checkRuntime().catch(() => undefined);
setInterval(() => void checkRuntime().catch(() => undefined), 5000);
setInterval(() => void refreshSellerTimeline().catch(() => undefined), 2000);
void loadRuntimeLiveSessionSpec();
void refreshSellerTimeline().catch(() => undefined);
renderIntake();
updateLaunchChecklist();
setActiveStep("products");
