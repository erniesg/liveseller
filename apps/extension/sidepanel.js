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
    draftReady: "Draft ready",
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
    statusDraftReady: "AI prepared a listing draft. Please review before approving.",
    statusApproved: "Approved. Demo upload is queued, but no Shopee backend call is made.",
    statusRejected: "Rejected. The draft will not be uploaded.",
    removeImage: "Remove image",
    suggestedName: "AI suggested product from images",
    suggestedPrice: "SGD 19.90",
    suggestedDescription:
      "AI detected the uploaded product images and prepared a seller-editable draft. Confirm product details, price, stock, and category before approving upload."
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
    draftReady: "草稿已就緒",
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
    statusDraftReady: "AI 已準備上架草稿，請審核後再批准。",
    statusApproved: "已批准。示範上架已排入佇列，但不會呼叫 Shopee 後端。",
    statusRejected: "已拒絕。此草稿不會上傳。",
    removeImage: "移除圖片",
    suggestedName: "AI 從圖片建議的商品",
    suggestedPrice: "SGD 19.90",
    suggestedDescription:
      "AI 已根據上傳的商品圖片建立可編輯草稿。批准上架前，請確認商品資料、價格、庫存與類別。"
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
    draftReady: "草稿已就绪",
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
    statusDraftReady: "AI 已准备上架草稿，请审核后再批准。",
    statusApproved: "已批准。演示上架已加入队列，但不会调用 Shopee 后端。",
    statusRejected: "已拒绝。此草稿不会上传。",
    removeImage: "移除图片",
    suggestedName: "AI 从图片建议的商品",
    suggestedPrice: "SGD 19.90",
    suggestedDescription:
      "AI 已根据上传的商品图片创建可编辑草稿。批准上架前，请确认商品资料、价格、库存与类别。"
  }
};

let currentLanguage = "en";
let selectedImages = [];
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

function fillDraft() {
  if (productName && !productName.value) {
    productName.value = translate("suggestedName");
  }
  if (price && !price.value) {
    price.value = translate("suggestedPrice");
  }
  if (stock && !stock.value) {
    stock.value = "20";
  }
  if (description && !description.value) {
    description.value = translate("suggestedDescription");
  }

  setText(aiStatus, "draftReady");
  aiStatus?.classList.remove("tag-warning");
  aiStatus?.classList.add("tag-success");
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

  setText(aiStatus, "waitingForImages");
  aiStatus?.classList.add("tag-warning");
  aiStatus?.classList.remove("tag-success");
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
