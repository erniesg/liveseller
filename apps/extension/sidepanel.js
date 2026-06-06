const translations = {
  en: {
    headerTitle: "Upload Assistant",
    stepImages: "Images",
    stepAi: "AI draft",
    stepApproval: "Approval",
    uploadTitle: "Drop product images",
    uploadHint: "Add clear product photos. AI will prepare listing details for review.",
    emptyState: "No images",
    imageCount: "{count} image(s)",
    dropCta: "Drag images here",
    dropSubcopy: "or click to choose files",
    aiTitle: "AI listing draft",
    aiHint: "Generated locally as a front-end demo. Seller approval is required.",
    waitingForImages: "Waiting",
    draftReady: "Completed",
    productName: "Product name",
    category: "Category",
    categoryFashion: "Fashion Accessories",
    categoryBeauty: "Beauty",
    categoryHome: "Home & Living",
    price: "Suggested price",
    stock: "Stock",
    description: "Description",
    approvalRequired: "Approval required",
    approvalCopy: "Nothing is uploaded to Shopee until the seller approves this draft.",
    approveUpload: "Approve",
    rejectDraft: "Reject",
    statusIdle: "Add product images to begin.",
    statusDraftReady: "AI completed the listing draft. Review the fields, then approve.",
    statusApproved: "Approved. Demo upload is queued, but no Shopee backend call is made.",
    statusRejected: "Rejected. The draft will not be uploaded.",
    removeImage: "Remove image",
    listingCompleteness: "Listing draft completed",
    summaryDetails: "Product name, category, price, and stock are filled.",
    summaryDescription: "Description is generated from the uploaded image.",
    summaryReview: "Seller can edit any field before approval.",
    suggestedName: "{name}",
    suggestedPrice: "SGD 19.90",
    suggestedDescription:
      "Product draft for {name}. AI prepared a seller-editable listing from the uploaded image, including product name, category, suggested price, stock, and a concise product description. Please confirm photo accuracy, variants, price, and stock before approving upload."
  },
  "zh-hant": {
    headerTitle: "上架助手",
    stepImages: "圖片",
    stepAi: "AI 草稿",
    stepApproval: "審批",
    uploadTitle: "拖放商品圖片",
    uploadHint: "加入清晰商品照，AI 會整理上架資料供你審核。",
    emptyState: "尚無圖片",
    imageCount: "{count} 張圖片",
    dropCta: "將圖片拖到這裡",
    dropSubcopy: "或點擊選擇檔案",
    aiTitle: "AI 上架草稿",
    aiHint: "此為前端示範產生內容，必須由賣家批准。",
    waitingForImages: "等待中",
    draftReady: "已完成",
    productName: "商品名稱",
    category: "類別",
    categoryFashion: "時尚配件",
    categoryBeauty: "美妝",
    categoryHome: "家居生活",
    price: "建議價格",
    stock: "庫存",
    description: "商品描述",
    approvalRequired: "需要賣家審批",
    approvalCopy: "賣家批准草稿前，不會上傳任何內容到 Shopee。",
    approveUpload: "批准",
    rejectDraft: "拒絕",
    statusIdle: "加入商品圖片即可開始。",
    statusDraftReady: "AI 已完成上架草稿，請檢查欄位後再批准。",
    statusApproved: "已批准。示範上架已排入佇列，但不會呼叫 Shopee 後端。",
    statusRejected: "已拒絕。此草稿不會上傳。",
    removeImage: "移除圖片",
    listingCompleteness: "上架草稿已完成",
    summaryDetails: "商品名稱、類別、價格與庫存已填好。",
    summaryDescription: "商品描述已根據上傳圖片產生。",
    summaryReview: "賣家批准前仍可編輯任何欄位。",
    suggestedName: "{name}",
    suggestedPrice: "SGD 19.90",
    suggestedDescription:
      "{name} 的商品草稿。AI 已根據上傳圖片建立可編輯上架資料，包含商品名稱、類別、建議價格、庫存與精簡商品描述。批准前請確認圖片、款式、價格與庫存。"
  },
  "zh-hans": {
    headerTitle: "上架助手",
    stepImages: "图片",
    stepAi: "AI 草稿",
    stepApproval: "审批",
    uploadTitle: "拖放商品图片",
    uploadHint: "加入清晰商品图，AI 会整理上架资料供你审核。",
    emptyState: "暂无图片",
    imageCount: "{count} 张图片",
    dropCta: "将图片拖到这里",
    dropSubcopy: "或点击选择文件",
    aiTitle: "AI 上架草稿",
    aiHint: "此为前端演示生成内容，必须由卖家批准。",
    waitingForImages: "等待中",
    draftReady: "已完成",
    productName: "商品名称",
    category: "类别",
    categoryFashion: "时尚配件",
    categoryBeauty: "美妆",
    categoryHome: "家居生活",
    price: "建议价格",
    stock: "库存",
    description: "商品描述",
    approvalRequired: "需要卖家审批",
    approvalCopy: "卖家批准草稿前，不会上传任何内容到 Shopee。",
    approveUpload: "批准",
    rejectDraft: "拒绝",
    statusIdle: "加入商品图片即可开始。",
    statusDraftReady: "AI 已完成上架草稿，请检查字段后再批准。",
    statusApproved: "已批准。演示上架已加入队列，但不会调用 Shopee 后端。",
    statusRejected: "已拒绝。此草稿不会上传。",
    removeImage: "移除图片",
    listingCompleteness: "上架草稿已完成",
    summaryDetails: "商品名称、类别、价格与库存已填好。",
    summaryDescription: "商品描述已根据上传图片生成。",
    summaryReview: "卖家批准前仍可编辑任何字段。",
    suggestedName: "{name}",
    suggestedPrice: "SGD 19.90",
    suggestedDescription:
      "{name} 的商品草稿。AI 已根据上传图片创建可编辑上架资料，包含商品名称、类别、建议价格、库存与精简商品描述。批准前请确认图片、款式、价格与库存。"
  }
};

let currentLanguage = "en";
let selectedImages = [];
let generatedDraftSource = "";
let statusKey = "statusIdle";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const previewGrid = document.getElementById("preview-grid");
const imageCount = document.getElementById("image-count");
const aiStatus = document.getElementById("ai-status");
const status = document.getElementById("status");
const approve = document.getElementById("approve");
const reject = document.getElementById("reject");
const stepAi = document.getElementById("step-ai");
const stepApproval = document.getElementById("step-approval");
const productName = document.getElementById("product-name");
const price = document.getElementById("price");
const stock = document.getElementById("stock");
const description = document.getElementById("description");
const listingSummary = document.getElementById("listing-summary");
const languageButtons = document.querySelectorAll("[data-language]");

function translate(key, params = {}) {
  const value = translations[currentLanguage][key] ?? translations.en[key] ?? key;
  return Object.entries(params).reduce(
    (text, [param, replacement]) => text.replace(`{${param}}`, replacement),
    value
  );
}

function setText(element, key, params) {
  if (element) {
    element.textContent = translate(key, params);
  }
}

function setStatus(key) {
  statusKey = key;
  setText(status, key);
}

function applyLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    if (key) {
      element.textContent = translate(key);
    }
  });

  languageButtons.forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-language") === language);
  });

  selectedImages.length ? fillDraft() : clearDraft();
  renderPreviews();
  setStatus(statusKey);
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
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(img|image|photo|product|shopee|upload)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleanName ? titleCase(cleanName) : translate("suggestedName", { name: "Featured Product" });
}

function buildDraftFromPrimaryImage() {
  const primaryImage = selectedImages[0];
  const inferredName = primaryImage ? inferProductName(primaryImage.name) : "Featured Product";

  return {
    source: primaryImage?.name ?? "",
    name: translate("suggestedName", { name: inferredName }),
    price: translate("suggestedPrice"),
    stock: "20",
    description: translate("suggestedDescription", { name: inferredName })
  };
}

function fillDraft() {
  const draft = buildDraftFromPrimaryImage();
  const shouldRefreshDraft = generatedDraftSource !== draft.source;

  if (productName && (!productName.value || shouldRefreshDraft)) {
    productName.value = draft.name;
  }
  if (price && (!price.value || shouldRefreshDraft)) {
    price.value = draft.price;
  }
  if (stock && (!stock.value || shouldRefreshDraft)) {
    stock.value = draft.stock;
  }
  if (description && (!description.value || shouldRefreshDraft)) {
    description.value = draft.description;
  }
  generatedDraftSource = draft.source;

  setText(aiStatus, "draftReady");
  aiStatus?.classList.remove("tag-warning");
  aiStatus?.classList.add("tag-success");
  listingSummary?.removeAttribute("hidden");
  stepAi?.classList.add("active");
  approve?.removeAttribute("disabled");
  reject?.removeAttribute("disabled");
}

function clearDraft() {
  if (productName) {
    productName.value = "";
  }
  if (price) {
    price.value = "";
  }
  if (stock) {
    stock.value = "20";
  }
  if (description) {
    description.value = "";
  }
  generatedDraftSource = "";

  setText(aiStatus, "waitingForImages");
  aiStatus?.classList.add("tag-warning");
  aiStatus?.classList.remove("tag-success");
  listingSummary?.setAttribute("hidden", "true");
  stepAi?.classList.remove("active");
  stepApproval?.classList.remove("active");
  approve?.setAttribute("disabled", "true");
  reject?.setAttribute("disabled", "true");
}

function updateFlowState() {
  if (!selectedImages.length) {
    setText(imageCount, "emptyState");
    clearDraft();
    setStatus("statusIdle");
    return;
  }

  setText(imageCount, "imageCount", { count: String(selectedImages.length) });
  fillDraft();
  setStatus("statusDraftReady");
}

function renderPreviews() {
  if (!previewGrid) {
    return;
  }

  previewGrid.innerHTML = "";
  selectedImages.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";

    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.setAttribute("aria-label", translate("removeImage"));
    remove.addEventListener("click", () => {
      URL.revokeObjectURL(image.url);
      selectedImages = selectedImages.filter((_, imageIndex) => imageIndex !== index);
      renderPreviews();
      updateFlowState();
    });

    item.append(img, remove);
    previewGrid.append(item);
  });
}

function addFiles(files) {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  const nextImages = imageFiles.map((file) => ({
    name: file.name,
    url: URL.createObjectURL(file)
  }));

  selectedImages = [...selectedImages, ...nextImages].slice(0, 9);
  renderPreviews();
  updateFlowState();
}

dropzone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragging");
});

dropzone?.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragging");
});

dropzone?.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragging");
  addFiles(event.dataTransfer?.files ?? []);
});

fileInput?.addEventListener("change", (event) => {
  addFiles(event.target.files ?? []);
  fileInput.value = "";
});

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const language = button.getAttribute("data-language");
    if (language) {
      applyLanguage(language);
    }
  });
});

approve?.addEventListener("click", () => {
  stepApproval?.classList.add("active");
  setStatus("statusApproved");
});

reject?.addEventListener("click", () => {
  stepApproval?.classList.remove("active");
  setStatus("statusRejected");
});

applyLanguage(currentLanguage);
