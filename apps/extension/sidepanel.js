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
    approveUpload: "Approve",
    publishProduct: "Publish",
    cancelDraft: "Cancel",
    uploadingStatus: "Uploading",
    statusIdle: "Add product images to begin.",
    statusDraftReady: "AI completed the listing draft. Review the fields, then approve.",
    statusUploading: "Uploading draft to Shopee. Please keep the Shopee product page open.",
    statusUploadIncomplete: "Still uploading. Shopee required fields are not complete yet, so Publish will stay disabled.",
    statusMissingCells: "Fill up Missing Cell. Shopee still has required fields missing after 2 upload checks.",
    statusApproved: "Approved. Check Shopee, then publish or cancel.",
    statusFillApplied: "Applied to Shopee: {fields}. Additional required fields may be filled automatically. Please check each Shopee section before publishing.",
    statusFillUnavailable: "Approved locally, but no active Shopee product tab was available to fill.",
    statusPublished: "Publish action sent to Shopee. Finish any Shopee confirmation on the page.",
    statusCancelled: "Cancelled. Cleared the extension draft and requested Shopee fields to clear.",
    removeImage: "Remove image",
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
    approveUpload: "批准",
    publishProduct: "發布",
    cancelDraft: "取消",
    uploadingStatus: "上傳中",
    statusIdle: "加入商品圖片即可開始。",
    statusDraftReady: "AI 已完成上架草稿，請檢查欄位後再批准。",
    statusUploading: "正在上傳草稿到 Shopee，請保持 Shopee 商品頁開啟。",
    statusUploadIncomplete: "仍在上傳。Shopee 必填欄位尚未完成，發布按鈕會保持停用。",
    statusMissingCells: "請補齊缺漏欄位。經過 2 次上傳檢查後，Shopee 仍有必填欄位未完成。",
    statusApproved: "已批准。示範上架已排入佇列，但不會呼叫 Shopee 後端。",
    statusFillApplied: "已套用到 Shopee：{fields}。部分必填欄位可能已自動填入，發布前請逐項檢查每個 Shopee 區塊。",
    statusFillUnavailable: "已在本機批准，但找不到可填入的 Shopee 商品頁。",
    statusPublished: "已送出 Shopee 發布動作。如頁面有確認提示，請在 Shopee 完成。",
    statusCancelled: "已取消。已清除插件草稿，並要求 Shopee 清除已填資料。",
    removeImage: "移除圖片",
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
    approveUpload: "批准",
    publishProduct: "发布",
    cancelDraft: "取消",
    uploadingStatus: "上传中",
    statusIdle: "加入商品图片即可开始。",
    statusDraftReady: "AI 已完成上架草稿，请检查字段后再批准。",
    statusUploading: "正在上传草稿到 Shopee，请保持 Shopee 商品页开启。",
    statusUploadIncomplete: "仍在上传。Shopee 必填字段尚未完成，发布按钮会保持停用。",
    statusMissingCells: "请补齐缺漏字段。经过 2 次上传检查后，Shopee 仍有必填字段未完成。",
    statusApproved: "已批准。演示上架已加入队列，但不会调用 Shopee 后端。",
    statusFillApplied: "已应用到 Shopee：{fields}。部分必填字段可能已自动填入，发布前请逐项检查每个 Shopee 区块。",
    statusFillUnavailable: "已在本地批准，但找不到可填入的 Shopee 商品页。",
    statusPublished: "已发送 Shopee 发布动作。如页面有确认提示，请在 Shopee 完成。",
    statusCancelled: "已取消。已清除插件草稿，并要求 Shopee 清除已填资料。",
    removeImage: "移除图片",
    suggestedName: "{name}",
    suggestedPrice: "SGD 19.90",
    suggestedDescription:
      "{name} 的商品草稿。AI 已根据上传图片创建可编辑上架资料，包含商品名称、类别、建议价格、库存与精简商品描述。批准前请确认图片、款式、价格与库存。"
  }
};

let currentLanguage = "en";
let selectedImages = [];
let generatedDraftSource = "";
let generatedDraft = undefined;
let statusKey = "statusIdle";
let draftApproved = false;

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const previewGrid = document.getElementById("preview-grid");
const imageCount = document.getElementById("image-count");
const aiStatus = document.getElementById("ai-status");
const status = document.getElementById("status");
const approve = document.getElementById("approve");
const reject = document.getElementById("reject");
const uploadProgress = document.getElementById("upload-progress");
const stepAi = document.getElementById("step-ai");
const stepApproval = document.getElementById("step-approval");
const productName = document.getElementById("product-name");
const price = document.getElementById("price");
const stock = document.getElementById("stock");
const description = document.getElementById("description");
const languageButtons = document.querySelectorAll("[data-language]");

const sellerDropManifest = window.LiveSellerSellerDropManifest;

const defaultAdditionalFields = {
  specifications: {
    brand: "No brand",
    gender: "Women",
    material: "Alloy",
    countryOfOrigin: "Singapore",
    occasion: "Casual",
    style: "Vintage",
    earringStyle: "Not Applicable",
    customProduct: "No"
  },
  shipping: {
    weight: "0.1",
    width: "10",
    length: "10",
    height: "5",
    standardDelivery: true
  }
};

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

function setUploading(isUploading) {
  uploadProgress?.toggleAttribute("hidden", !isUploading);

  if (isUploading) {
    approve?.setAttribute("disabled", "true");
    reject?.setAttribute("disabled", "true");
    setText(approve, "uploadingStatus");
    setStatus("statusUploading");
    return;
  }

  approve?.removeAttribute("disabled");
  reject?.removeAttribute("disabled");
  setText(approve, draftApproved ? "publishProduct" : "approveUpload");
}

function keepUploadingIncomplete() {
  uploadProgress?.removeAttribute("hidden");
  approve?.setAttribute("disabled", "true");
  reject?.removeAttribute("disabled");
  setText(approve, "uploadingStatus");
  setStatus("statusUploadIncomplete");
}

function showMissingCellsAlert() {
  uploadProgress?.setAttribute("hidden", "true");
  approve?.setAttribute("disabled", "true");
  reject?.removeAttribute("disabled");
  setText(approve, "uploadingStatus");
  setStatus("statusMissingCells");
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

  setText(approve, draftApproved ? "publishProduct" : "approveUpload");
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

function findSellerDropGroup(fileName) {
  return sellerDropManifest?.groups?.find((group) => {
    if (group.imageFiles?.includes(fileName)) {
      return true;
    }
    return group.imageFilePrefixes?.some((prefix) => fileName.startsWith(prefix));
  });
}

function localizedSellerDropTitle(group) {
  if (currentLanguage === "zh-hant") {
    return group.label
      .replace("Vintage Gold-Tone Grape Leaf Brooch", "中古金色葡萄葉胸針")
      .replace("Vintage Blue Stone Bar Brooch", "中古藍石長形胸針")
      .replace("Vintage Cream Cameo Brooch", "中古米色浮雕胸針");
  }
  if (currentLanguage === "zh-hans") {
    return group.label
      .replace("Vintage Gold-Tone Grape Leaf Brooch", "中古金色葡萄叶胸针")
      .replace("Vintage Blue Stone Bar Brooch", "中古蓝石长形胸针")
      .replace("Vintage Cream Cameo Brooch", "中古米色浮雕胸针");
  }
  return group.listingDraft?.title ?? group.label;
}

function localizedSellerDropDescription(group) {
  const name = localizedSellerDropTitle(group);
  if (currentLanguage === "zh-hant") {
    return `${name} 的上架草稿，來自 seller-drop 夾中的商品圖片與結構化商品資料。價格、庫存與類別已按 fixture 記錄填入。批准前請確認材質、成色、尺寸、扣具狀態與任何年代或真偽說明。`;
  }
  if (currentLanguage === "zh-hans") {
    return `${name} 的上架草稿，来自 seller-drop 文件夹中的商品图片与结构化商品资料。价格、库存与类别已按 fixture 记录填入。批准前请确认材质、成色、尺寸、扣具状态与任何年代或真伪说明。`;
  }
  return group.listingDraft?.description ?? `${name} draft from seller-drop fixtures.`;
}

function buildDraftFromPrimaryImage() {
  const primaryImage = selectedImages[0];
  const sellerDropGroup = primaryImage ? findSellerDropGroup(primaryImage.name) : undefined;

  if (sellerDropGroup) {
    return {
      source: primaryImage.name,
      name: localizedSellerDropTitle(sellerDropGroup),
      price: `${sellerDropGroup.currency} ${Number(sellerDropGroup.price).toFixed(2)}`,
      stock: String(sellerDropGroup.stock),
      categoryPath: sellerDropGroup.category,
      categoryIndex: 0,
      description: localizedSellerDropDescription(sellerDropGroup),
      additionalFields: defaultAdditionalFields
    };
  }

  const inferredName = primaryImage ? inferProductName(primaryImage.name) : "Featured Product";

  return {
    source: primaryImage?.name ?? "",
    name: translate("suggestedName", { name: inferredName }),
    price: translate("suggestedPrice"),
    stock: "20",
    categoryPath: category?.selectedOptions?.[0]?.textContent?.trim() ?? "Fashion Accessories",
    categoryIndex: 0,
    description: translate("suggestedDescription", { name: inferredName }),
    additionalFields: defaultAdditionalFields
  };
}

function readImagePayload(image) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        name: image.file.name,
        type: image.file.type || "image/jpeg",
        dataUrl: String(reader.result)
      });
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(image.file);
  });
}

async function currentDraftPayload() {
  return {
    name: productName?.value ?? "",
    category: generatedDraft?.categoryPath ?? category?.selectedOptions?.[0]?.textContent?.trim() ?? "",
    price: price?.value ?? "",
    stock: stock?.value ?? "",
    description: description?.value ?? "",
    additionalFields: generatedDraft?.additionalFields ?? defaultAdditionalFields,
    images: await Promise.all(selectedImages.map(readImagePayload))
  };
}

async function fillActiveShopeeTab() {
  if (typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.tabs?.sendMessage) {
    return undefined;
  }

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  const activeTab = tabs.find((tab) => tab.id);

  if (!activeTab?.id) {
    return undefined;
  }

  return chrome.tabs.sendMessage(activeTab.id, {
    type: "LIVESELLER_FILL_PRODUCT_DRAFT",
    draft: await currentDraftPayload()
  });
}

async function sendShopeeCommand(type) {
  if (typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.tabs?.sendMessage) {
    return undefined;
  }

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  const activeTab = tabs.find((tab) => tab.id);

  if (!activeTab?.id) {
    return undefined;
  }

  return chrome.tabs.sendMessage(activeTab.id, { type });
}

async function publishActiveShopeeTab() {
  return sendShopeeCommand("LIVESELLER_PUBLISH_PRODUCT_DRAFT");
}

async function clearActiveShopeeTab() {
  return sendShopeeCommand("LIVESELLER_CLEAR_PRODUCT_DRAFT");
}

function fillDraft() {
  const draft = buildDraftFromPrimaryImage();
  const shouldRefreshDraft = generatedDraftSource !== draft.source;
  generatedDraft = draft;

  if (productName && (!productName.value || shouldRefreshDraft)) {
    productName.value = draft.name;
  }
  if (price && (!price.value || shouldRefreshDraft)) {
    price.value = draft.price;
  }
  if (stock && (!stock.value || shouldRefreshDraft)) {
    stock.value = draft.stock;
  }
  if (category && shouldRefreshDraft) {
    category.selectedIndex = draft.categoryIndex;
  }
  if (description && (!description.value || shouldRefreshDraft)) {
    description.value = draft.description;
  }
  generatedDraftSource = draft.source;

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
  generatedDraftSource = "";
  generatedDraft = undefined;
  draftApproved = false;
  setText(approve, "approveUpload");

  setText(aiStatus, "waitingForImages");
  aiStatus?.classList.add("tag-warning");
  aiStatus?.classList.remove("tag-success");
  stepAi?.classList.remove("active");
  stepApproval?.classList.remove("active");
  approve?.setAttribute("disabled", "true");
  reject?.setAttribute("disabled", "true");
}

function clearSelectedImages() {
  selectedImages.forEach((image) => URL.revokeObjectURL(image.url));
  selectedImages = [];
  renderPreviews();
  setText(imageCount, "emptyState");
  clearDraft();
}

function updateFlowState() {
  if (!selectedImages.length) {
    setText(imageCount, "emptyState");
    clearDraft();
    setStatus("statusIdle");
    return;
  }

  draftApproved = false;
  setText(approve, "approveUpload");
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
    file,
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

approve?.addEventListener("click", async () => {
  stepApproval?.classList.add("active");
  let keepUploading = false;
  try {
    if (draftApproved) {
      const response = await publishActiveShopeeTab();
      if (response?.ok) {
        setStatus("statusPublished");
      } else {
        setStatus("statusFillUnavailable");
      }
      return;
    }

    setUploading(true);
    let result = undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fillActiveShopeeTab();
      result = response?.result;
      if (result?.publishReady) {
        break;
      }
    }

    if (!result) {
      setStatus("statusFillUnavailable");
      return;
    }

    if (!result.publishReady) {
      keepUploading = true;
      draftApproved = false;
      showMissingCellsAlert();
      return;
    }

    statusKey = "statusFillApplied";
    draftApproved = true;
    setText(approve, "publishProduct");
    setText(status, "statusFillApplied", {
      fields: result.filled.length ? result.filled.join(", ") : "none",
      skipped: result.skipped.length ? result.skipped.join(", ") : "none"
    });
  } catch {
    setStatus("statusFillUnavailable");
  } finally {
    if (!keepUploading) {
      setUploading(false);
    }
  }
});

reject?.addEventListener("click", async () => {
  stepApproval?.classList.remove("active");
  draftApproved = false;
  setText(approve, "approveUpload");
  await clearActiveShopeeTab();
  clearSelectedImages();
  setStatus("statusCancelled");
});

applyLanguage(currentLanguage);
