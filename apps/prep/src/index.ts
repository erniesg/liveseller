import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type EvidenceCitation,
  type LiveSessionSpec,
  type PolicyPack,
  type ProductRecord,
  type PromoRecord,
  LiveSessionSpecSchema,
  PolicyPackSchema,
  ProductRecordSchema,
  PromoRecordSchema,
  seedCitation,
  validLiveSessionSpec,
  validPolicyPack,
  validProducts,
  validPromo,
  vintageJewelryLiveSessionSpec,
  vintageJewelryProducts
} from "@liveseller/contracts";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SEED_FOLDER = join(currentDir, "..", "seed");
export const DEFAULT_SELLER_DROP_FOLDER = "/Users/erniesg/Downloads/liveseller";

export type MissingFieldReport = {
  sessionId: string;
  generatedAt: string;
  missingByProduct: Array<{
    productId: string;
    sku: string;
    missingFields: string[];
  }>;
  marketplaceReadiness: "ready_for_mock" | "needs_seller_review" | "blocked";
};

export type PrepAsset = {
  id: string;
  productId?: string;
  kind: "product_image" | "overlay_card" | "live_cover";
  uri: string;
  citations: EvidenceCitation[];
};

export type SellerDropFolderImage = {
  fileName: string;
  absolutePath: string;
  productId: string;
  productImageId: string;
  productImageUri: string;
};

export type SellerDropFolderGroup = {
  productId: string;
  label: string;
  imageFiles: SellerDropFolderImage[];
};

export type SellerDropFolderAssets = {
  folder: string;
  images: SellerDropFolderImage[];
  groups: SellerDropFolderGroup[];
};

export type SellerDropFolderExtractionOptions = {
  products?: ProductRecord[];
  liveSessionSpec?: LiveSessionSpec;
};

export type IngestedSellerFile = {
  fileName: string;
  absolutePath: string;
  relativePath: string;
  kind: "image" | "document" | "other";
  sizeBytes: number;
};

export type SellerGuidance = {
  productId: string;
  talkTrack: string;
  researchNotes: string[];
  likelyBuyerQuestions: string[];
  riskNotes: string[];
};

export type ImageGenerationPlan = {
  productId: string;
  model: "gpt-image-2";
  sourceImageUris: string[];
  prompts: string[];
};

export type ProductIdentityDraft = {
  productId: string;
  title: string;
  sku: string;
  aliases: string[];
  category: string;
  price: number;
  currency: ProductRecord["currency"];
  stock: number;
  variantCount: number;
  imageCount: number;
  sourceConfidence: number;
  identitySource: "structured_fixture";
  missingFields: string[];
  evidence: EvidenceCitation[];
};

export type SellerUiPolicy = {
  sessionId: string;
  status: "seller_review_required" | "ready_for_live_review";
  products: Array<{
    productId: string;
    title: string;
    sku: string;
    priceLabel: string;
    stockLabel: string;
    imageCount: number;
    missingFields: string[];
    reviewRequired: boolean;
  }>;
  photoEnhancement: Array<{
    productId: string;
    model: "gpt-image-2";
    sourceImageCount: number;
    promptCount: number;
    requiresApproval: boolean;
  }>;
  publicAutomation: {
    autoSend: "low_risk_structured_only";
    approvalRequired: string[];
    blockedAutoSend: string[];
  };
  renderHints: {
    sidePanelSectionId: "liveseller-prep-review";
    productAttribute: "data-liveseller-product-id";
    actionAttribute: "data-liveseller-action-id";
  };
};

export type PrepExtractionResult = {
  products: ProductRecord[];
  promos: PromoRecord[];
  policyPack: PolicyPack;
  citations: EvidenceCitation[];
  assets: PrepAsset[];
  missingFieldReport: MissingFieldReport;
  liveSessionSpec: LiveSessionSpec;
  sellerGuidance: SellerGuidance[];
  imageGenerationPlan: ImageGenerationPlan[];
};

export type SellerMaterialIngestionResult = PrepExtractionResult & {
  ingestedFiles: IngestedSellerFile[];
  productIdentityDrafts: ProductIdentityDraft[];
  photoEnhancementPlan: ImageGenerationPlan[];
  sellerUiPolicy: SellerUiPolicy;
};

const requiredSeedFiles = ["product-notes.md", "policy-notes.md", "promo-notes.csv"];

export function assertSeedFolder(seedFolder = DEFAULT_SEED_FOLDER): void {
  if (!existsSync(seedFolder) || !statSync(seedFolder).isDirectory()) {
    throw new Error(`Seed folder not found: ${seedFolder}`);
  }

  const files = new Set(readdirSync(seedFolder));
  const missing = requiredSeedFiles.filter((file) => !files.has(file));
  if (missing.length > 0) {
    throw new Error(`Seed folder is missing required files: ${missing.join(", ")}`);
  }
}

export function readSeedDocuments(seedFolder = DEFAULT_SEED_FOLDER): Record<string, string> {
  assertSeedFolder(seedFolder);
  return Object.fromEntries(
    requiredSeedFiles.map((file) => [file, readFileSync(join(seedFolder, file), "utf8")])
  );
}

export function buildMissingFieldReport(
  products: ProductRecord[],
  sessionId = validLiveSessionSpec.sessionId
): MissingFieldReport {
  return {
    sessionId,
    generatedAt: "2026-06-06T02:00:00.000Z",
    missingByProduct: products.map((product) => {
      const missingFields: string[] = [];
      if (!product.shopeeProductId) {
        missingFields.push("shopeeProductId");
      }
      if (product.media.images.length === 0) {
        missingFields.push("primaryProductImage");
      }
      if (product.sourceConfidence < 0.85) {
        missingFields.push("sellerReviewForLowConfidenceExtraction");
      }

      return {
        productId: product.id,
        sku: product.sku,
        missingFields
      };
    }),
    marketplaceReadiness: "needs_seller_review"
  };
}

const supportedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const supportedDocumentExtensions = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".json",
  ".md",
  ".pdf",
  ".txt",
  ".xls",
  ".xlsx"
]);

function fileKind(fileName: string): IngestedSellerFile["kind"] {
  const extension = extname(fileName).toLowerCase();
  if (supportedImageExtensions.has(extension)) {
    return "image";
  }
  if (supportedDocumentExtensions.has(extension)) {
    return "document";
  }
  return "other";
}

export function discoverSellerMaterialFiles(inputPath: string): IngestedSellerFile[] {
  if (!existsSync(inputPath)) {
    throw new Error(`Seller material path not found: ${inputPath}`);
  }

  const rootStats = statSync(inputPath);
  const root = rootStats.isDirectory() ? inputPath : dirname(inputPath);
  const paths = rootStats.isDirectory()
    ? readdirSync(inputPath, { recursive: true }).map((entry) => join(inputPath, String(entry)))
    : [inputPath];

  return paths
    .filter((path) => statSync(path).isFile())
    .filter((path) => !path.split("/").some((part) => part.startsWith(".")))
    .map((path) => {
      const stats = statSync(path);
      return {
        fileName: path.split("/").at(-1) ?? path,
        absolutePath: path,
        relativePath: relative(root, path),
        kind: fileKind(path),
        sizeBytes: stats.size
      };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

type DropFolderImageMatch = {
  product: ProductRecord;
  productIndex: number;
  image: ProductRecord["media"]["images"][number];
  imageIndex: number;
};

function dropFolderFileNameFromCitation(citation: EvidenceCitation): string | undefined {
  const match = citation.excerpt.match(/drop-folder file:\s*(.+)$/u);
  return match?.[1]?.trim();
}

function buildDropFolderImageIndex(products: ProductRecord[]): Map<string, DropFolderImageMatch> {
  const index = new Map<string, DropFolderImageMatch>();

  products.forEach((product, productIndex) => {
    product.media.images.forEach((image, imageIndex) => {
      image.citations.forEach((citation) => {
        const fileName = dropFolderFileNameFromCitation(citation);
        if (!fileName) {
          return;
        }
        if (index.has(fileName)) {
          throw new Error(`Duplicate seller drop-folder image citation: ${fileName}`);
        }
        index.set(fileName, {
          product,
          productIndex,
          image,
          imageIndex
        });
      });
    });
  });

  return index;
}

export function discoverSellerDropFolderAssets(
  folder = DEFAULT_SELLER_DROP_FOLDER,
  products = vintageJewelryProducts
): SellerDropFolderAssets {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new Error(`Seller drop folder not found: ${folder}`);
  }

  const imageIndex = buildDropFolderImageIndex(products);
  const files = readdirSync(folder)
    .filter((fileName) => supportedImageExtensions.has(extname(fileName).toLowerCase()));

  const images = files.map((fileName) => {
    const match = imageIndex.get(fileName);
    if (!match) {
      throw new Error(
        `Unsupported seller drop-folder image: ${fileName}. Add a product image citation ending with "drop-folder file: ${fileName}".`
      );
    }

    return {
      fileName,
      absolutePath: join(folder, fileName),
      productId: match.product.id,
      productImageId: match.image.id,
      productImageUri: match.image.uri,
      productIndex: match.productIndex,
      imageIndex: match.imageIndex
    };
  }).sort((left, right) => {
    if (left.productIndex !== right.productIndex) {
      return left.productIndex - right.productIndex;
    }
    return left.imageIndex - right.imageIndex;
  }).map(({ productIndex: _productIndex, imageIndex: _imageIndex, ...image }) => image);

  const groups = products
    .map((product) => ({
      productId: product.id,
      label: product.title,
      imageFiles: images.filter((image) => image.productId === product.id)
    }))
    .filter((group) => group.imageFiles.length > 0);

  return { folder, images, groups };
}

const sellerGuidanceOverrides: Record<string, Omit<SellerGuidance, "productId">> = {
  "prod-vintage-gold-grape-leaf-brooch": {
    talkTrack:
      "Start with the grape clusters and layered leaf texture; show how the gold-tone finish catches light on a blazer or scarf.",
    researchNotes: [
      "Botanical grape-and-leaf motifs are easy for viewers to remember and compare.",
      "Use visual language: gold-tone, sculpted leaves, raised grape beads.",
      "Do not claim gold purity without seller certificate."
    ],
    likelyBuyerQuestions: ["Is it real gold?", "How heavy is it?", "Can it hold on a scarf?"],
    riskNotes: ["Material and era claims need seller confirmation before public commitment."]
  },
  "prod-vintage-blue-stone-bar-brooch": {
    talkTrack:
      "Show the blue centerpiece first, then tilt under direct light so viewers see the rhinestone sparkle and bar shape.",
    researchNotes: [
      "The visual contrast between sky-blue stones, deep-blue center, and clear rhinestones is the main selling point.",
      "Position as a statement accent for lapels, scarves, or dress necklines.",
      "Describe stones visually unless certificates identify them."
    ],
    likelyBuyerQuestions: ["Are the blue stones turquoise?", "Any missing stones?", "Can you show the back pin?"],
    riskNotes: ["Stone identity and condition promises should be checked on camera."]
  },
  "prod-vintage-cameo-brooch": {
    talkTrack:
      "Lead with the cameo portrait relief; move close to camera so buyers can inspect the carving depth and gold-tone rim.",
    researchNotes: [
      "Cameo styling reads strongly on livestream because the portrait relief is recognizable.",
      "A side angle helps show raised carving and condition.",
      "Avoid shell, stone, brand, or era claims unless supplied in seller docs."
    ],
    likelyBuyerQuestions: ["Is the cameo shell?", "Can I see the back?", "Any chips or cracks?"],
    riskNotes: ["Authenticity and material questions require seller confirmation or a certificate."]
  }
};

export function buildSellerGuidance(products = vintageJewelryProducts): SellerGuidance[] {
  return products.map((product) => {
    const override = sellerGuidanceOverrides[product.id];
    if (override) {
      return {
        productId: product.id,
        ...override
      };
    }

    const variants = product.variants.map((variant) => variant.name).join(", ") || "single option";
    const primaryImageAlt = product.media.images[0]?.alt ?? product.title;

    return {
      productId: product.id,
      talkTrack: `Open with ${product.title}; show ${primaryImageAlt.toLowerCase()}, then call out ${product.currency} ${product.price.toFixed(2)}, stock ${product.stock}, and variants: ${variants}.`,
      researchNotes: [
        `Structured category: ${product.category}.`,
        product.description,
        "Use only structured price, stock, SKU, variant, shipping, and return-policy fields for factual claims."
      ],
      likelyBuyerQuestions: ["How much is it?", "How many are left?", "Which variants are available?"],
      riskNotes: ["Material, compatibility, authenticity, warranty, and condition claims need seller confirmation if not in structured records."]
    };
  });
}

export function buildImageGenerationPlan(products = vintageJewelryProducts): ImageGenerationPlan[] {
  return products.map((product) => ({
    productId: product.id,
    model: "gpt-image-2",
    sourceImageUris: product.media.images.map((image) => image.uri),
    prompts: [
      `Shopee-ready square cover for ${product.title} in ${product.category}: preserve the exact product shape, visible condition, color, and included parts; use a clean neutral background; no added features, brand marks, certificates, packaging, or text.`,
      `Create a livestream overlay hero image for ${product.title}: crop for a vertical product card, keep the original product unchanged, make the main details easy to inspect, and avoid inventing materials or variants.`,
      `Create one alternate catalog angle for ${product.title}: use the supplied product photo as source, clarify scale and surface detail, preserve any visible wear or condition marks, and do not create claims not backed by seller records.`
    ]
  }));
}

export function buildProductIdentityDrafts(
  products: ProductRecord[],
  missingFieldReport: MissingFieldReport
): ProductIdentityDraft[] {
  return products.map((product) => {
    const missingFields =
      missingFieldReport.missingByProduct.find((row) => row.productId === product.id)?.missingFields ?? [];

    return {
      productId: product.id,
      title: product.title,
      sku: product.sku,
      aliases: product.aliases,
      category: product.category,
      price: product.price,
      currency: product.currency,
      stock: product.stock,
      variantCount: product.variants.length,
      imageCount: product.media.images.length,
      sourceConfidence: product.sourceConfidence,
      identitySource: "structured_fixture",
      missingFields,
      evidence: product.evidence
    };
  });
}

export function buildSellerUiPolicy(
  sessionId: string,
  products: ProductRecord[],
  missingFieldReport: MissingFieldReport,
  photoEnhancementPlan: ImageGenerationPlan[]
): SellerUiPolicy {
  const productRows = products.map((product) => {
    const missingFields =
      missingFieldReport.missingByProduct.find((row) => row.productId === product.id)?.missingFields ?? [];

    return {
      productId: product.id,
      title: product.title,
      sku: product.sku,
      priceLabel: `${product.currency} ${product.price.toFixed(2)}`,
      stockLabel: `${product.stock} in structured stock`,
      imageCount: product.media.images.length,
      missingFields,
      reviewRequired: missingFields.length > 0 || product.sourceConfidence < 0.95
    };
  });

  return {
    sessionId,
    status: productRows.some((product) => product.reviewRequired)
      ? "seller_review_required"
      : "ready_for_live_review",
    products: productRows,
    photoEnhancement: photoEnhancementPlan.map((plan) => ({
      productId: plan.productId,
      model: plan.model,
      sourceImageCount: plan.sourceImageUris.length,
      promptCount: plan.prompts.length,
      requiresApproval: true
    })),
    publicAutomation: {
      autoSend: "low_risk_structured_only",
      approvalRequired: [
        "refund or return commitment",
        "legal, fraud, fake, or counterfeit accusation",
        "discounts not backed by structured Shopee promo records",
        "material, authenticity, warranty, or condition claims missing from structured records"
      ],
      blockedAutoSend: [
        "fake-product accusation",
        "fraud or legal threat",
        "refund commitment",
        "unauthorized discount",
        "unclear risky request"
      ]
    },
    renderHints: {
      sidePanelSectionId: "liveseller-prep-review",
      productAttribute: "data-liveseller-product-id",
      actionAttribute: "data-liveseller-action-id"
    }
  };
}

export function buildSellerDropFolderExtraction(
  folder = DEFAULT_SELLER_DROP_FOLDER,
  options: SellerDropFolderExtractionOptions = {}
): PrepExtractionResult {
  const sourceProducts = options.products ?? vintageJewelryProducts;
  const dropAssets = discoverSellerDropFolderAssets(folder, sourceProducts);
  const discoveredProductIds = new Set(dropAssets.groups.map((group) => group.productId));
  const products = sourceProducts
    .filter((product) => discoveredProductIds.has(product.id))
    .map((product) => ProductRecordSchema.parse(product));
  const session = LiveSessionSpecSchema.parse({
    ...(options.liveSessionSpec ?? vintageJewelryLiveSessionSpec),
    products
  });

  return {
    products,
    promos: session.promos.map((promo) => PromoRecordSchema.parse(promo)),
    policyPack: PolicyPackSchema.parse(session.policyPack),
    citations: dropAssets.images.flatMap((image) => {
      const product = products.find((candidate) => candidate.id === image.productId);
      return product?.media.images.find((candidate) => candidate.id === image.productImageId)?.citations ?? [];
    }),
    assets: buildPrepAssets(products),
    missingFieldReport: buildMissingFieldReport(products, session.sessionId),
    liveSessionSpec: session,
    sellerGuidance: buildSellerGuidance(products),
    imageGenerationPlan: buildImageGenerationPlan(products)
  };
}

export function buildSellerMaterialIngestion(
  inputPath = DEFAULT_SELLER_DROP_FOLDER,
  options: SellerDropFolderExtractionOptions = {}
): SellerMaterialIngestionResult {
  const ingestedFiles = discoverSellerMaterialFiles(inputPath);
  const inputStats = statSync(inputPath);
  const extractionFolder = inputStats.isDirectory() ? inputPath : dirname(inputPath);
  const extraction = buildSellerDropFolderExtraction(extractionFolder, options);
  const productIdentityDrafts = buildProductIdentityDrafts(
    extraction.products,
    extraction.missingFieldReport
  );
  const photoEnhancementPlan = extraction.imageGenerationPlan;
  const sellerUiPolicy = buildSellerUiPolicy(
    extraction.liveSessionSpec.sessionId,
    extraction.products,
    extraction.missingFieldReport,
    photoEnhancementPlan
  );

  return {
    ...extraction,
    ingestedFiles,
    productIdentityDrafts,
    photoEnhancementPlan,
    sellerUiPolicy
  };
}

export function buildPrepAssets(products: ProductRecord[]): PrepAsset[] {
  const productCards = products.map((product) => ({
    id: `asset-card-${product.id}`,
    productId: product.id,
    kind: "overlay_card" as const,
    uri: `/assets/overlay/${product.id}.json`,
    citations: product.evidence
  }));

  const productImages = products.flatMap((product) =>
    product.media.images.map((image) => ({
      id: image.id,
      productId: product.id,
      kind: "product_image" as const,
      uri: image.uri,
      citations: image.citations
    }))
  );

  return [
    ...productImages,
    ...productCards,
    {
      id: "asset-live-cover",
      kind: "live_cover",
      uri: "/assets/live/live-cover.jpg",
      citations: [seedCitation]
    }
  ];
}

export function buildSeedExtraction(seedFolder = DEFAULT_SEED_FOLDER): PrepExtractionResult {
  readSeedDocuments(seedFolder);

  const products = validProducts.map((product) => ProductRecordSchema.parse(product));
  const promo = PromoRecordSchema.parse(validPromo);
  const policyPack = PolicyPackSchema.parse(validPolicyPack);
  const liveSessionSpec = LiveSessionSpecSchema.parse({
    ...validLiveSessionSpec,
    products,
    promos: [promo],
    policyPack
  });

  return {
    products,
    promos: [promo],
    policyPack,
    citations: [seedCitation],
    assets: buildPrepAssets(products),
    missingFieldReport: buildMissingFieldReport(products),
    liveSessionSpec,
    sellerGuidance: [],
    imageGenerationPlan: []
  };
}
