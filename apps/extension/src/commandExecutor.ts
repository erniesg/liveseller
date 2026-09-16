import {
  type LiveAction,
  type ShopeeCreateProductCommand,
  type ShopeeStartLivestreamCommand,
  type ToolResult,
  ShopeeCreateProductCommandSchema,
  ShopeeStartLivestreamCommandSchema,
  ToolResultSchema
} from "@liveseller/contracts";

export type ComposerState = {
  value: string;
  isSellerTyping: boolean;
};

export type ExecutedCommand = {
  toolResult: ToolResult;
  nextComposerValue: string;
  publicSend: boolean;
};

export type ExecutedProductCommand = {
  toolResult: ToolResult;
  command?: ShopeeCreateProductCommand;
  filledFields?: string[];
  uploadedImages?: {
    count: number;
    fileNames: string[];
    diagnostic?: string;
  };
  submitted?: boolean;
};

export type ExecutedGoLiveCommand = {
  toolResult: ToolResult;
  goLivePressed: boolean;
};

export type ExecutedLivestreamCommand = {
  toolResult: ToolResult;
  command?: ShopeeStartLivestreamCommand;
  setupEvidence?: {
    liveSessionCreated: boolean;
    credentialEvidence: {
      serverUrl: "present_redacted";
      secretToken: "present_redacted";
    };
    publicOverlayReady: boolean;
    goLivePressed: false;
  };
};

const extensionEvidence = [
  {
    sourceId: "extension-command-executor",
    sourceType: "system" as const,
    locator: "apps/extension/src/commandExecutor.ts",
    excerpt: "Deterministic seller-tab command executor result.",
    confidence: 1
  }
];

function result(actionId: string, status: ToolResult["status"], error?: string): ToolResult {
  return ToolResultSchema.parse({
    actionId,
    adapter: "shopee-content-script",
    status,
    evidence: extensionEvidence,
    error,
    timestamp: new Date().toISOString()
  });
}

export function canWriteDraft(composer: ComposerState): boolean {
  return composer.value.trim().length === 0 && !composer.isSellerTyping;
}

export function executeSellerCommand(action: LiveAction, composer: ComposerState): ExecutedCommand {
  if (action.type === "send_reply") {
    if (action.risk !== "low" || action.requiresApproval || action.payload.kind !== "send_reply") {
      return {
        toolResult: result(action.actionId, "rejected", "send_reply requires low risk and no approval"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    if (!canWriteDraft(composer)) {
      return {
        toolResult: result(action.actionId, "skipped", "seller is typing or composer is not empty"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    return {
      toolResult: result(action.actionId, "applied"),
      nextComposerValue: "",
      publicSend: true
    };
  }

  if (action.type === "draft_reply" && action.payload.kind === "draft_reply") {
    if (!canWriteDraft(composer)) {
      return {
        toolResult: result(action.actionId, "skipped", "seller is typing or composer is not empty"),
        nextComposerValue: composer.value,
        publicSend: false
      };
    }

    return {
      toolResult: result(action.actionId, "applied"),
      nextComposerValue: action.payload.text,
      publicSend: false
    };
  }

  if (action.type === "escalate" || action.type === "request_approval") {
    return {
      toolResult: result(action.actionId, "applied"),
      nextComposerValue: composer.value,
      publicSend: false
    };
  }

  return {
    toolResult: result(action.actionId, "skipped", "action is not handled by the seller tab"),
    nextComposerValue: composer.value,
    publicSend: false
  };
}

function readCommandId(value: unknown): string {
  if (value && typeof value === "object" && "commandId" in value) {
    const commandId = (value as { commandId?: unknown }).commandId;
    if (typeof commandId === "string" && commandId.trim().length > 0) {
      return commandId;
    }
  }
  return "unknown-create-product-command";
}

export function executeShopeeCreateProductCommand(input: unknown): ExecutedProductCommand {
  const parsed = ShopeeCreateProductCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      toolResult: result(
        readCommandId(input),
        "rejected",
        "create_product requires approved or edited product review state"
      )
    };
  }

  return {
    toolResult: result(parsed.data.commandId, "applied"),
    command: parsed.data
  };
}

function firstElement<T extends HTMLInputElement | HTMLTextAreaElement>(
  root: ParentNode,
  selectors: string[]
): T | undefined {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      return node as T;
    }
  }
  return undefined;
}

function firstReplyComposer(
  root: ParentNode,
  selectors: string[]
): HTMLInputElement | HTMLTextAreaElement | HTMLElement | undefined {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLElement) {
      return node;
    }
  }
  return undefined;
}

function writeField(
  root: ParentNode,
  selectors: string[],
  value: string,
  fieldName: string
): string | undefined {
  const element = firstElement(root, selectors);
  if (!element) {
    return undefined;
  }
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return fieldName;
}

function imageDataUrl(image: { uri?: string } | undefined): string | undefined {
  return typeof image?.uri === "string" && image.uri.startsWith("data:image/")
    ? image.uri
    : undefined;
}

function fileNameForImage(image: { id?: string; alt?: string } | undefined, index: number, mime: string): string {
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

function fileFromDataUrl(image: { id?: string; uri?: string; alt?: string } | undefined, index: number): File | undefined {
  const dataUrl = imageDataUrl(image);
  const [header, base64] = String(dataUrl || "").split(",");
  if (!header?.startsWith("data:") || !base64 || typeof atob !== "function" || typeof File !== "function") {
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

function uploadProductImages(
  root: ParentNode,
  images: Array<{ id?: string; uri?: string; alt?: string }>
): ExecutedProductCommand["uploadedImages"] {
  const files = images.map(fileFromDataUrl).filter((file): file is File => Boolean(file)).slice(0, 1);
  if (files.length === 0) {
    return { count: 0, fileNames: [], diagnostic: "no_image_data_url" };
  }
  const input = root.querySelector("input[type='file'][accept*='image'], input[type='file']");
  if (!(input instanceof HTMLInputElement)) {
    return { count: 0, fileNames: files.map((file) => file.name), diagnostic: "no_image_file_input" };
  }
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files
  });
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { count: files.length, fileNames: files.map((file) => file.name) };
}

function compactText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/gu, " ").trim().toLowerCase();
}

function findButtonByText(root: ParentNode, labels: string[]): HTMLButtonElement | undefined {
  const normalizedLabels = labels.map(compactText);
  return Array.from(root.querySelectorAll("button")).find((button) => {
    const text = compactText(button.textContent);
    return normalizedLabels.some((label) => text === label || text.includes(label));
  }) as HTMLButtonElement | undefined;
}

function clickButton(button: HTMLButtonElement | undefined): boolean {
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
    return false;
  }
  button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  button.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true }));
  button.click();
  return true;
}

export function executeQueuedShopeeCreateProductCommand(
  input: unknown,
  root: ParentNode = document,
  options: { submit?: boolean } = {}
): ExecutedProductCommand {
  const parsed = ShopeeCreateProductCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      toolResult: result(
        readCommandId(input),
        "rejected",
        "create_product requires approved or edited product review state"
      )
    };
  }

  const product = parsed.data.payload.product;
  const filledFields = [
    writeField(root, [
      "[name='product_name']",
      "[name='name']",
      "input[placeholder*='Product Name' i]",
      "input[placeholder*='product name' i]",
      "input[placeholder*='Brand Name' i]",
      "input[placeholder*='Product Type' i]"
    ], product.title, "title"),
    writeField(root, [
      "textarea[name='description']",
      "[name='description']",
      "textarea[placeholder*='description' i]"
    ], product.description, "description"),
    writeField(root, [
      "[name='price']",
      "input[placeholder*='price' i]"
    ], String(product.price), "price"),
    writeField(root, [
      "[name='stock']",
      "input[placeholder*='stock' i]"
    ], String(product.stock), "stock"),
    writeField(root, [
      "[name='sku']",
      "input[placeholder*='sku' i]"
    ], product.sku, "sku"),
    writeField(root, [
      "[name='weight']",
      "input[placeholder*='weight' i]"
    ], String(product.dimensions.weightGrams / 1000), "weight"),
    writeField(root, [
      "[name='length']",
      "input[placeholder*='length' i]",
      "input[placeholder*='l (integer)' i]"
    ], String(product.dimensions.lengthCm), "parcelLength"),
    writeField(root, [
      "[name='width']",
      "input[placeholder*='width' i]",
      "input[placeholder*='w (integer)' i]"
    ], String(product.dimensions.widthCm), "parcelWidth"),
    writeField(root, [
      "[name='height']",
      "input[placeholder*='height' i]",
      "input[placeholder*='h (integer)' i]"
    ], String(product.dimensions.heightCm), "parcelHeight")
  ].filter((field): field is string => Boolean(field));
  const uploadedImages = uploadProductImages(root, product.media.images);

  if (filledFields.length < 4) {
    return {
      toolResult: result(parsed.data.commandId, "failed", "Shopee product form selectors were not available"),
      command: parsed.data,
      filledFields,
      uploadedImages,
      submitted: false
    };
  }

  const submitted = options.submit
    ? clickButton(findButtonByText(root, ["Save and Publish", "Save and Delist", "Publish"]))
    : false;

  return {
    toolResult: result(parsed.data.commandId, "applied"),
    command: parsed.data,
    filledFields,
    uploadedImages,
    submitted
  };
}

export function executeConfirmedShopeeGoLive(root: ParentNode = document): ExecutedGoLiveCommand {
  const goLivePressed = clickButton(findButtonByText(root, ["Go Live", "Start Live"]));
  return {
    toolResult: result(
      "confirmed-go-live",
      goLivePressed ? "applied" : "failed",
      goLivePressed ? undefined : "Go Live button was not available"
    ),
    goLivePressed
  };
}

export function executeQueuedSellerReply(
  action: LiveAction,
  root: ParentNode = document
): ExecutedCommand {
  const composer = firstReplyComposer(root, [
    "[data-liveseller-composer]",
    "[role='textbox']",
    "div[contenteditable='true']",
    "textarea[placeholder*='message' i]",
    "textarea",
    "input[placeholder*='message' i]"
  ]);
  const composerValue = composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement
    ? composer.value
    : composer?.textContent ?? "";
  const composerState = {
    value: composerValue,
    isSellerTyping: Boolean(composerValue.trim())
  };
  const executed = executeSellerCommand(action, composerState);

  if (executed.toolResult.status === "applied" && action.payload.kind === "send_reply" && composer) {
    if (composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement) {
      composer.value = action.payload.text;
    } else {
      composer.textContent = action.payload.text;
      composer.innerText = action.payload.text;
    }
    const inputEvent = typeof InputEvent === "function"
      ? new InputEvent("input", { bubbles: true, data: action.payload.text, inputType: "insertText" })
      : new Event("input", { bubbles: true });
    composer.dispatchEvent(inputEvent);
    const button = root.querySelector("[data-liveseller-send], button[class*='send-btn'], button[type='submit']");
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  }

  return executed;
}

export function executeShopeeStartLivestreamCommand(input: unknown): ExecutedLivestreamCommand {
  const parsed = ShopeeStartLivestreamCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      toolResult: result(
        readCommandId(input),
        "rejected",
        "prepare_livestream requires approved dry-run setup with redacted stream credentials"
      )
    };
  }

  return {
    toolResult: result(parsed.data.commandId, "applied"),
    command: parsed.data,
    setupEvidence: {
      liveSessionCreated: true,
      credentialEvidence: {
        serverUrl: "present_redacted",
        secretToken: "present_redacted"
      },
      publicOverlayReady: true,
      goLivePressed: false
    }
  };
}
