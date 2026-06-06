function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function visible(element) {
  if (navigator.userAgent.includes("jsdom")) {
    return true;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function editable(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) && !element.disabled && !element.readOnly;
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}

function fillField(field, value) {
  if (!field || !value) {
    return false;
  }
  field.scrollIntoView?.({ block: "center", inline: "nearest" });
  setNativeValue(field, value);
  return true;
}

function clearField(field) {
  if (!field) {
    return false;
  }
  field.scrollIntoView?.({ block: "center", inline: "nearest" });
  setNativeValue(field, "");
  return true;
}

function getTextCandidates(selector = "label, div, span, p, button") {
  return Array.from(document.querySelectorAll(selector))
    .filter((node) => visible(node) && normalizeText(node.textContent));
}

function compactText(node) {
  return normalizeText(Array.from(node.childNodes)
    .filter((child) => child.nodeType === Node.TEXT_NODE)
    .map((child) => child.textContent)
    .join(" ") || node.textContent);
}

function isDisabled(element) {
  return Boolean(
    element.disabled ||
    element.getAttribute("aria-disabled") === "true" ||
    normalizeText(element.className).includes("disabled")
  );
}

function clickLikeUser(element) {
  if (!element) {
    return false;
  }

  element.scrollIntoView?.({ block: "center", inline: "nearest" });
  ["pointerdown", "mousedown", "mouseup", "pointerup", "click"].forEach((type) => {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  });
  return true;
}

function visibleTextMatches(node, token) {
  const text = compactText(node);
  const normalizedToken = normalizeText(token);
  return text === normalizedToken || (
    text.includes(normalizedToken) &&
    text.length <= normalizedToken.length + 16
  );
}

function clickableAncestor(node) {
  if (!node) {
    return undefined;
  }
  return node.closest("button, li, [role='button'], .shopee-category-list-item, div") ?? node;
}

function findCompactTextTarget(token, selector = "button, li, div, span, [role='button']") {
  const normalizedToken = normalizeText(token);
  return Array.from(document.querySelectorAll(selector))
    .filter((node) => visible(node))
    .map((node) => ({
      node,
      text: compactText(node)
    }))
    .filter(({ text }) => text === normalizedToken || (
      text.includes(normalizedToken) &&
      text.length <= normalizedToken.length + 16
    ))
    .sort((left, right) => left.text.length - right.text.length)
    .map(({ node }) => node)[0];
}

function findLooseTextTarget(token, selector = "button, li, div, span, [role='button']") {
  const normalizedToken = normalizeText(token);
  return Array.from(document.querySelectorAll(selector))
    .filter((node) => visible(node))
    .map((node) => ({
      node,
      text: normalizeText(node.textContent)
    }))
    .filter(({ text }) => text.includes(normalizedToken) && text.length <= 120)
    .sort((left, right) => left.text.length - right.text.length)
    .map(({ node }) => node)[0];
}

function findExactTextTarget(text, selector = "button, li, div, span, [role='button']") {
  const normalizedText = normalizeText(text);
  return Array.from(document.querySelectorAll(selector))
    .filter((node) => visible(node))
    .map((node) => ({
      node,
      text: normalizeText(node.textContent)
    }))
    .filter((entry) => entry.text === normalizedText)
    .sort((left, right) => left.text.length - right.text.length)
    .map(({ node }) => node)[0];
}

function findByPlaceholder(patterns) {
  const fields = Array.from(document.querySelectorAll("input, textarea"));
  return fields.find((field) => {
    const placeholder = normalizeText(field.getAttribute("placeholder"));
    return editable(field) && visible(field) && patterns.some((pattern) => placeholder.includes(pattern));
  });
}

function findVisibleByText(patterns, selector = "div, span, button, input") {
  return Array.from(document.querySelectorAll(selector))
    .filter((node) => visible(node))
    .find((node) => {
      const text = normalizeText(node.textContent || node.getAttribute("placeholder") || node.getAttribute("value"));
      return patterns.some((pattern) => text.includes(normalizeText(pattern)));
    });
}

function categoryModalIsOpen() {
  return Boolean(
    findVisibleByText(["edit category"], "div, span") ||
    findByPlaceholder(["please input at least"])
  );
}

async function openCategorySelector() {
  await clickShopeeTab(["Basic information", "基本信息", "基本資料"]);
  window.scrollTo({ top: 0, behavior: "smooth" });
  await delay(500);

  const candidates = [];
  const placeholder = findByPlaceholder(["please set category"]);
  if (placeholder) {
    candidates.push(
      placeholder,
      placeholder.closest(".shopee-input, .shopee-selector, .product-edit-form-item, div")
    );
  }

  const categoryLabel = findLabelElement(["category", "类别", "類別"]);
  if (categoryLabel) {
    candidates.push(
      nearestFollowingVisible(categoryLabel, "input, button, svg, [role='button'], .shopee-icon, div, span"),
      categoryLabel.closest(".product-edit-form-item, div")
    );
  }

  const setCategoryText = findVisibleByText(["please set category", "set category"], "input, div, span, button");
  if (setCategoryText) {
    candidates.push(
      setCategoryText,
      setCategoryText.closest(".shopee-input, .shopee-selector, .product-edit-form-item, button, div")
    );
  }

  for (const candidate of candidates.filter(Boolean)) {
    clickLikeUser(candidate);
    await delay(700);
    if (categoryModalIsOpen()) {
      return true;
    }
  }

  return categoryModalIsOpen();
}

function findByNearbyLabel(labelPatterns, fieldSelector = "input, textarea") {
  const labels = getTextCandidates()
    .filter((node) => labelPatterns.some((pattern) => normalizeText(node.textContent).includes(pattern)));

  for (const label of labels) {
    const container = label.closest("section, form, .shopee-form-item, .product-edit-form-item, .product-edit-form-item-content, div");
    const field = container?.querySelector(fieldSelector);
    if (field && editable(field) && visible(field)) {
      return field;
    }
  }

  return undefined;
}

function findFieldAfterLabel(labelPatterns, fieldSelector = "input, textarea") {
  const label = findLabelElement(labelPatterns);

  if (!label) {
    return undefined;
  }

  const fields = Array.from(document.querySelectorAll(fieldSelector))
    .filter((field) => editable(field) && visible(field));
  return fields.find((field) => label.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function fieldValue(field) {
  if (!field) {
    return "";
  }
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return field.value;
  }
  return field.textContent || field.getAttribute("value") || "";
}

function fieldLooksEmpty(field) {
  const value = normalizeText(fieldValue(field));
  return !value || value.includes("please select") || value.includes("please set") || value.includes("input");
}

function cleanLabelText(node) {
  return compactText(node)
    .replace(/^\*\s*/u, "")
    .replace(/\s+\d+\s*\/\s*\d+$/u, "");
}

function findLabelElement(labelPatterns) {
  return getTextCandidates()
    .find((node) => {
      const text = cleanLabelText(node);
      return labelPatterns.some((pattern) => text === normalizeText(pattern));
    });
}

function nearestFollowingVisible(label, selector) {
  const labelRect = label.getBoundingClientRect();
  return Array.from(document.querySelectorAll(selector))
    .filter((node) => visible(node) && (label.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING))
    .map((node) => ({
      node,
      distance: Math.abs(node.getBoundingClientRect().top - labelRect.top)
    }))
    .sort((left, right) => left.distance - right.distance)
    .map(({ node }) => node)[0];
}

async function selectDropdownAfterLabel(labelPatterns, preferredValues) {
  const label = findLabelElement(labelPatterns);
  if (!label) {
    return false;
  }

  const control = nearestFollowingVisible(
    label,
    "input, [role='combobox'], [aria-haspopup='listbox'], .shopee-selector, .shopee-select, div, span"
  );
  if (!control) {
    return false;
  }

  clickableAncestor(control)?.click();
  await delay(500);

  for (const value of preferredValues) {
    const option = findExactTextTarget(value) ?? findCompactTextTarget(value) ?? findLooseTextTarget(value);
    if (option) {
      clickLikeUser(clickableAncestor(option));
      await delay(400);
      return true;
    }
  }

  return false;
}

async function selectEmptyDropdownAfterLabel(labelPatterns, preferredValues) {
  const label = findLabelElement(labelPatterns);
  if (!label) {
    return false;
  }

  const control = nearestFollowingVisible(
    label,
    "input, [role='combobox'], [aria-haspopup='listbox'], .shopee-selector, .shopee-select, div, span"
  );
  if (!control || !fieldLooksEmpty(control)) {
    return false;
  }

  return selectDropdownAfterLabel(labelPatterns, preferredValues);
}

function fillByPlaceholderSequence(placeholders, values) {
  const filled = [];
  placeholders.forEach((placeholder, index) => {
    const normalizedPlaceholder = normalizeText(placeholder);
    const field = Array.from(document.querySelectorAll("input"))
      .find((input) => {
        const text = normalizeText(input.getAttribute("placeholder"));
        const matches = normalizedPlaceholder.length <= 2
          ? text === normalizedPlaceholder
          : text.includes(normalizedPlaceholder);
        return editable(input) && visible(input) && matches;
      });
    if (fillField(field, values[index])) {
      filled.push(placeholder);
    }
  });
  return filled;
}

function clickVisibleText(patterns) {
  const target = getTextCandidates("button, div, span, a")
    .find((node) => patterns.some((pattern) => normalizeText(node.textContent) === pattern));

  if (!target) {
    return false;
  }

  target.scrollIntoView?.({ block: "center", inline: "nearest" });
  target.click();
  return true;
}

async function clickShopeeTab(tabNames) {
  if (!clickVisibleText(tabNames.map(normalizeText))) {
    return false;
  }
  await delay(500);
  return true;
}

function findDescriptionEditor() {
  const normalField = findByPlaceholder(["description"])
    ?? findByNearbyLabel(["description", "商品描述"], "textarea, input")
    ?? Array.from(document.querySelectorAll("textarea")).find((field) => editable(field) && visible(field));
  if (normalField) {
    return normalField;
  }

  const editors = Array.from(document.querySelectorAll("[contenteditable='true'], [role='textbox']"));
  return editors.find((editor) => visible(editor));
}

function fillDescriptionField(field, value) {
  if (!field || !value) {
    return false;
  }

  field.scrollIntoView?.({ block: "center", inline: "nearest" });
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    setNativeValue(field, value);
    return true;
  }

  field.focus?.();
  field.textContent = value;
  field.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    data: value,
    inputType: "insertText"
  }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function clearDescriptionField(field) {
  if (!field) {
    return false;
  }

  field.scrollIntoView?.({ block: "center", inline: "nearest" });
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    setNativeValue(field, "");
    return true;
  }

  field.focus?.();
  field.textContent = "";
  field.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    data: "",
    inputType: "deleteContentBackward"
  }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function dataUrlToFile(image) {
  const [header, base64] = image.dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || image.type || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], image.name, { type: mime });
}

function setInputFiles(input, files) {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));

  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clearImageInputs() {
  const transfer = new DataTransfer();
  const imageInputs = Array.from(document.querySelectorAll('input[type="file"]'))
    .filter((input) => !input.disabled);

  imageInputs.forEach((input) => {
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  return imageInputs.length > 0;
}

async function uploadProductImages(images) {
  if (!images?.length) {
    return false;
  }

  const files = images.map(dataUrlToFile);
  const imageInputs = Array.from(document.querySelectorAll('input[type="file"]'))
    .filter((input) => {
      const accept = normalizeText(input.getAttribute("accept"));
      return !input.disabled && (accept.includes("image") || accept.includes(".jpg") || accept.includes(".png"));
    });

  if (imageInputs.length) {
    setInputFiles(imageInputs[0], files);
    if (imageInputs[1]) {
      setInputFiles(imageInputs[1], [files[0]]);
    }
    await delay(1000);
    return true;
  }

  const addImageButton = getTextCandidates("button, div, span")
    .find((node) => normalizeText(node.textContent).includes("add image"));
  addImageButton?.click();
  await delay(400);

  const nextInput = Array.from(document.querySelectorAll('input[type="file"]'))
    .find((input) => !input.disabled);
  if (!nextInput) {
    return false;
  }

  setInputFiles(nextInput, files);
  await delay(1000);
  return true;
}

async function applyCategory(category) {
  if (!category) {
    return false;
  }

  const recommendedCategory = findExactTextTarget(category);
  if (recommendedCategory) {
    clickLikeUser(clickableAncestor(recommendedCategory));
    await delay(1000);
    return !categoryStillRequired();
  }

  if (!await openCategorySelector()) {
    return false;
  }

  const categoryTokens = category
    .split(">")
    .map((token) => token.trim())
    .filter(Boolean);
  const finalToken = categoryTokens[categoryTokens.length - 1];
  const searchTerms = [
    finalToken,
    finalToken?.replace(/&.*/u, "").trim(),
    "brooch",
    "pin"
  ].filter(Boolean);

  const search = findByPlaceholder(["please input at least", "please input", "search"]);
  if (searchTerms.length && search) {
    let searchMatch = undefined;

    for (const term of searchTerms) {
      fillField(search, term);
      await delay(800);
      searchMatch = findLooseTextTarget(term);
      if (searchMatch) {
        break;
      }
    }

    if (searchMatch) {
      const clickTarget = clickableAncestor(searchMatch);
      clickLikeUser(clickTarget);
      await delay(600);

      const searchConfirm = getTextCandidates("button, span")
        .map(clickableAncestor)
        .find((node) => ["confirm", "save", "ok", "确认", "確定"].includes(normalizeText(node.textContent)) && !isDisabled(node));
      if (searchConfirm) {
        clickLikeUser(searchConfirm);
        await delay(800);
        return true;
      }
    }
  }

  for (const token of categoryTokens) {
    const matchedCategory = findCompactTextTarget(token);
    if (!matchedCategory) {
      continue;
    }

    const clickTarget = clickableAncestor(matchedCategory);
    clickLikeUser(clickTarget);
    await delay(600);
  }

  const confirm = getTextCandidates("button, span")
    .map(clickableAncestor)
    .find((node) => ["confirm", "save", "ok", "确认", "確定"].includes(normalizeText(node.textContent)) && !isDisabled(node));
  if (confirm) {
    clickLikeUser(confirm);
    await delay(800);
    return true;
  }

  return false;
}

function categoryStillRequired() {
  const categoryField = findByPlaceholder(["please set category"])
    ?? findVisibleByText(["please set category"], "input, div, span");
  return Boolean(categoryField && fieldLooksEmpty(categoryField));
}

async function fillSpecificationFields(specifications = {}) {
  const filled = [];

  await clickShopeeTab(["Basic information", "基本信息", "基本資料"]);
  await delay(500);

  if (await selectDropdownAfterLabel(["brand", "品牌"], [specifications.brand, "No brand", "No Brand", "NoBrand"].filter(Boolean))) {
    filled.push("brand");
  }
  if (await selectDropdownAfterLabel(["gender", "性别", "性別"], [specifications.gender, "Women", "Female", "Unisex"].filter(Boolean))) {
    filled.push("gender");
  }
  if (await selectDropdownAfterLabel(["material", "材质", "材質"], [specifications.material, "Alloy", "Metal", "Others"].filter(Boolean))) {
    filled.push("material");
  }
  if (await selectDropdownAfterLabel(["country of origin", "产地", "產地"], [specifications.countryOfOrigin, "Singapore", "China", "Others"].filter(Boolean))) {
    filled.push("countryOfOrigin");
  }
  if (await selectDropdownAfterLabel(["occasion", "场合", "場合"], [specifications.occasion, "Casual", "Daily", "Others"].filter(Boolean))) {
    filled.push("occasion");
  }
  if (await selectDropdownAfterLabel(["style", "风格", "風格"], [specifications.style, "Vintage", "Classic", "Others"].filter(Boolean))) {
    filled.push("style");
  }
  if (await selectDropdownAfterLabel(["earring style", "耳环款式", "耳環款式"], [specifications.earringStyle, "Not Applicable", "Others"].filter(Boolean))) {
    filled.push("earringStyle");
  }
  if (await selectDropdownAfterLabel(["custom product", "定制商品", "客製商品"], [specifications.customProduct, "No", "No"].filter(Boolean))) {
    filled.push("customProduct");
  }

  return filled;
}

function generatedDefaultsFromDraft(draft) {
  const title = normalizeText(draft.name);
  const isJewelry = title.includes("brooch") || title.includes("pin") || title.includes("jewelry");

  return {
    brand: "No brand",
    gender: isJewelry ? "Women" : "Unisex",
    material: title.includes("gold") ? "Alloy" : "Metal",
    countryOfOrigin: "Singapore",
    occasion: "Casual",
    style: title.includes("vintage") ? "Vintage" : "Classic",
    earringStyle: "Not Applicable",
    customProduct: "No"
  };
}

async function auditBasicInformationRequiredFields(draft) {
  const filled = [];

  await clickShopeeTab(["Basic information", "基本信息", "基本資料"]);
  window.scrollTo({ top: 0, behavior: "smooth" });
  await delay(700);

  const productName = findByPlaceholder(["brand name + product type", "product name"])
    ?? findByNearbyLabel(["product name", "商品名称", "商品名稱"]);
  if (productName && normalizeText(fieldValue(productName)).length < 10 && fillField(productName, draft.name)) {
    filled.push("productName");
  }

  const categoryField = findByPlaceholder(["please set category"])
    ?? findVisibleByText(["please set category"], "input, div, span");
  if (fieldLooksEmpty(categoryField) && await applyCategory(draft.category)) {
    filled.push("category");
  }

  const generated = {
    ...generatedDefaultsFromDraft(draft),
    ...(draft.additionalFields?.specifications ?? {})
  };

  const requiredSelections = [
    [["brand", "品牌"], [generated.brand, "No brand", "No Brand", "NoBrand"]],
    [["gender", "性别", "性別"], [generated.gender, "Women", "Female", "Unisex"]],
    [["material", "材质", "材質"], [generated.material, "Alloy", "Metal", "Others"]],
    [["country of origin", "产地", "產地"], [generated.countryOfOrigin, "Singapore", "China", "Others"]],
    [["occasion", "场合", "場合"], [generated.occasion, "Casual", "Daily", "Others"]],
    [["style", "风格", "風格"], [generated.style, "Vintage", "Classic", "Others"]],
    [["earring style", "耳环款式", "耳環款式"], [generated.earringStyle, "Not Applicable", "Others"]],
    [["custom product", "定制商品", "客製商品"], [generated.customProduct, "No"]]
  ];

  for (const [labels, values] of requiredSelections) {
    if (await selectEmptyDropdownAfterLabel(labels, values.filter(Boolean))) {
      filled.push(labels[0]);
    }
  }

  return filled;
}

async function enableStandardShipping() {
  const label = getTextCandidates("div, span, p")
    .find((node) => normalizeText(node.textContent).includes("doorstep delivery"));
  if (!label) {
    return false;
  }

  const switchControl = nearestFollowingVisible(
    label,
    "[role='switch'], input[type='checkbox'], .shopee-switch, .shopee-switch__button, div"
  );
  if (!switchControl || isDisabled(switchControl)) {
    return false;
  }

  const checked = switchControl.getAttribute("aria-checked") === "true" ||
    switchControl.checked ||
    normalizeText(switchControl.className).includes("checked");
  if (!checked) {
    clickableAncestor(switchControl)?.click();
    await delay(400);
  }

  return true;
}

async function fillShippingFields(shipping = {}) {
  const filled = [];

  const shippingTabOpened = await clickShopeeTab(["Shipping", "物流", "运费", "運費"]);
  if (!shippingTabOpened) {
    return filled;
  }
  await delay(500);

  const weight = findFieldAfterLabel(["weight", "重量"]);
  if (fillField(weight, shipping.weight)) {
    filled.push("weight");
  }

  const parcelFields = fillByPlaceholderSequence(
    ["w (integer)", "l", "h (integer)"],
    [shipping.width, shipping.length, shipping.height]
  );
  if (parcelFields.length) {
    filled.push("parcelSize");
  }

  if (shipping.standardDelivery && await enableStandardShipping()) {
    filled.push("shippingOption");
  }

  return filled;
}

function findSaveAndPublishButton() {
  return getTextCandidates("button, span")
    .map(clickableAncestor)
    .find((node) => ["save and publish", "publish", "发布", "發布"].includes(normalizeText(node.textContent)));
}

function saveAndPublishIsEnabled() {
  const publish = findSaveAndPublishButton();
  return Boolean(publish && !isDisabled(publish));
}

async function waitForSaveAndPublishEnabled(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (saveAndPublishIsEnabled()) {
      return true;
    }
    await delay(750);
  }
  return false;
}

async function fillShopeeProductDraft(draft) {
  const filled = [];
  const skipped = [];

  if (await uploadProductImages(draft.images)) {
    filled.push("images");
  } else {
    skipped.push("images");
  }

  await clickShopeeTab(["Basic information", "基本信息", "基本資料"]);

  const productName = findByPlaceholder(["brand name + product type", "product name"])
    ?? findByNearbyLabel(["product name", "商品名称", "商品名稱"]);
  if (fillField(productName, draft.name)) {
    filled.push("productName");
  } else {
    skipped.push("productName");
  }

  if (await applyCategory(draft.category)) {
    filled.push("category");
  } else {
    skipped.push("category");
  }

  const specificationFields = await fillSpecificationFields(draft.additionalFields?.specifications);
  if (specificationFields.length) {
    filled.push(`specification:${specificationFields.join("/")}`);
  } else {
    skipped.push("specification");
  }

  await clickShopeeTab(["Description", "商品描述", "描述"]);
  const description = findDescriptionEditor();
  if (fillDescriptionField(description, draft.description)) {
    filled.push("description");
  } else {
    skipped.push("description");
  }

  const auditedFields = await auditBasicInformationRequiredFields(draft);
  if (auditedFields.length) {
    filled.push(`audit:${auditedFields.join("/")}`);
  }

  await clickShopeeTab(["Sales Information", "销售资料", "銷售資料", "销售资讯", "銷售資訊"]);
  const price = findFieldAfterLabel(["price", "价格", "價格"])
    ?? findByNearbyLabel(["price", "价格", "價格"])
    ?? findByPlaceholder(["price"]);
  if (fillField(price, draft.price?.replace(/^[A-Z]{3}\s*/u, ""))) {
    filled.push("price");
  } else {
    skipped.push("price");
  }

  const stock = findFieldAfterLabel(["stock", "库存", "庫存"])
    ?? findByNearbyLabel(["stock", "库存", "庫存"])
    ?? findByPlaceholder(["stock"]);
  if (fillField(stock, draft.stock)) {
    filled.push("stock");
  } else {
    skipped.push("stock");
  }

  const shippingFields = await fillShippingFields(draft.additionalFields?.shipping);
  if (shippingFields.length) {
    filled.push(`shipping:${shippingFields.join("/")}`);
  } else {
    skipped.push("shipping");
  }

  const publishReady = await waitForSaveAndPublishEnabled();
  if (!publishReady) {
    skipped.push("publishReady");
  }

  window.__liveSellerLastFillResult = {
    filled,
    skipped,
    publishReady,
    receivedAt: new Date().toISOString()
  };

  return window.__liveSellerLastFillResult;
}

async function clearShopeeProductDraft() {
  const cleared = [];

  if (clearImageInputs()) {
    cleared.push("images");
  }

  await clickShopeeTab(["Basic information", "基本信息", "基本資料"]);
  if (clearField(findByPlaceholder(["brand name + product type", "product name"])
    ?? findByNearbyLabel(["product name", "商品名称", "商品名稱"]))) {
    cleared.push("productName");
  }

  await clickShopeeTab(["Description", "商品描述", "描述"]);
  if (clearDescriptionField(findDescriptionEditor())) {
    cleared.push("description");
  }

  await clickShopeeTab(["Sales Information", "销售资料", "銷售資料", "销售资讯", "銷售資訊"]);
  if (clearField(findFieldAfterLabel(["price", "价格", "價格"])
    ?? findByNearbyLabel(["price", "价格", "價格"])
    ?? findByPlaceholder(["price"]))) {
    cleared.push("price");
  }

  if (clearField(findFieldAfterLabel(["stock", "库存", "庫存"])
    ?? findByNearbyLabel(["stock", "库存", "庫存"])
    ?? findByPlaceholder(["stock"]))) {
    cleared.push("stock");
  }

  window.__liveSellerLastClearResult = {
    cleared,
    receivedAt: new Date().toISOString()
  };

  return window.__liveSellerLastClearResult;
}

async function publishShopeeProductDraft() {
  const publish = findSaveAndPublishButton();

  if (!publish || isDisabled(publish)) {
    return { clicked: false };
  }

  clickLikeUser(publish);
  await delay(500);

  window.__liveSellerLastPublishResult = {
    clicked: true,
    receivedAt: new Date().toISOString()
  };

  return window.__liveSellerLastPublishResult;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LIVESELLER_FILL_PRODUCT_DRAFT") {
    fillShopeeProductDraft(message.draft)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    return true;
  }

  if (message?.type === "LIVESELLER_CLEAR_PRODUCT_DRAFT") {
    clearShopeeProductDraft()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    return true;
  }

  if (message?.type === "LIVESELLER_PUBLISH_PRODUCT_DRAFT") {
    publishShopeeProductDraft()
      .then((result) => sendResponse({ ok: result.clicked, result }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    return true;
  }

  return false;
});
