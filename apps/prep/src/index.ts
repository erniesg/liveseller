import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
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
export const DEFAULT_SELLER_DROP_FOLDER = join(currentDir, "..", "fixtures", "seller-drop", "vintage-jewelry");

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

const dropFolderGroups = [
  {
    prefix: "金色新品合集",
    productId: "prod-vintage-gold-grape-leaf-brooch",
    label: "Vintage gold-tone grape leaf brooch"
  },
  {
    prefix: "新品又上一组",
    productId: "prod-vintage-blue-stone-bar-brooch",
    label: "Vintage blue stone bar brooch"
  },
  {
    prefix: "新鲜出炉的卡霉霉",
    productId: "prod-vintage-cameo-brooch",
    label: "Vintage cream cameo brooch"
  }
] as const;

const supportedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function resolveDropFolderGroup(fileName: string): (typeof dropFolderGroups)[number] {
  const group = dropFolderGroups.find((candidate) => fileName.startsWith(candidate.prefix));
  if (!group) {
    throw new Error(`Unsupported seller drop-folder image group: ${fileName}`);
  }
  return group;
}

function groupIndex(productId: string): number {
  const index = dropFolderGroups.findIndex((group) => group.productId === productId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function imageOrder(fileName: string): number {
  const match = fileName.match(/\((\d+)\)\.[^.]+$/u);
  return match?.[1] ? Number(match[1]) : 0;
}

export function discoverSellerDropFolderAssets(
  folder = DEFAULT_SELLER_DROP_FOLDER
): SellerDropFolderAssets {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new Error(`Seller drop folder not found: ${folder}`);
  }

  const files = readdirSync(folder)
    .filter((fileName) => supportedImageExtensions.has(extname(fileName).toLowerCase()))
    .sort((left, right) => {
      const leftGroup = resolveDropFolderGroup(left);
      const rightGroup = resolveDropFolderGroup(right);
      if (leftGroup.productId !== rightGroup.productId) {
        return groupIndex(leftGroup.productId) - groupIndex(rightGroup.productId);
      }
      return imageOrder(left) - imageOrder(right);
    });

  const fixtureImageByProduct = Object.fromEntries(
    vintageJewelryProducts.map((product) => [product.id, product.media.images])
  );

  const images = files.map((fileName) => {
    const group = resolveDropFolderGroup(fileName);
    const productImages = fixtureImageByProduct[group.productId] ?? [];
    const productImage = productImages[imageOrder(fileName)];
    if (!productImage) {
      throw new Error(`No shared fixture image for seller drop file: ${fileName}`);
    }

    return {
      fileName,
      absolutePath: join(folder, fileName),
      productId: group.productId,
      productImageId: productImage.id,
      productImageUri: productImage.uri
    };
  });

  const groups = dropFolderGroups.map((group) => ({
    productId: group.productId,
    label: group.label,
    imageFiles: images.filter((image) => image.productId === group.productId)
  }));

  return { folder, images, groups };
}

export function buildSellerGuidance(products = vintageJewelryProducts): SellerGuidance[] {
  return products.map((product) => {
    if (product.id === "prod-vintage-gold-grape-leaf-brooch") {
      return {
        productId: product.id,
        talkTrack:
          "Start with the grape clusters and layered leaf texture; show how the gold-tone finish catches light on a blazer or scarf.",
        researchNotes: [
          "Botanical grape-and-leaf motifs are easy for viewers to remember and compare.",
          "Use visual language: gold-tone, sculpted leaves, raised grape beads.",
          "Do not claim gold purity without seller certificate."
        ],
        likelyBuyerQuestions: ["Is it real gold?", "How heavy is it?", "Can it hold on a scarf?"],
        riskNotes: ["Material and era claims need seller confirmation before public commitment."]
      };
    }

    if (product.id === "prod-vintage-blue-stone-bar-brooch") {
      return {
        productId: product.id,
        talkTrack:
          "Show the blue centerpiece first, then tilt under direct light so viewers see the rhinestone sparkle and bar shape.",
        researchNotes: [
          "The visual contrast between sky-blue stones, deep-blue center, and clear rhinestones is the main selling point.",
          "Position as a statement accent for lapels, scarves, or dress necklines.",
          "Describe stones visually unless certificates identify them."
        ],
        likelyBuyerQuestions: ["Are the blue stones turquoise?", "Any missing stones?", "Can you show the back pin?"],
        riskNotes: ["Stone identity and condition promises should be checked on camera."]
      };
    }

    return {
      productId: product.id,
      talkTrack:
        "Lead with the cameo portrait relief; move close to camera so buyers can inspect the carving depth and gold-tone rim.",
      researchNotes: [
        "Cameo styling reads strongly on livestream because the portrait relief is recognizable.",
        "A side angle helps show raised carving and condition.",
        "Avoid shell, stone, brand, or era claims unless supplied in seller docs."
      ],
      likelyBuyerQuestions: ["Is the cameo shell?", "Can I see the back?", "Any chips or cracks?"],
      riskNotes: ["Authenticity and material questions require seller confirmation or a certificate."]
    };
  });
}

export function buildImageGenerationPlan(products = vintageJewelryProducts): ImageGenerationPlan[] {
  return products.map((product) => ({
    productId: product.id,
    model: "gpt-image-2",
    sourceImageUris: product.media.images.map((image) => image.uri),
    prompts: [
      `Shopee-ready square cover for ${product.title}: preserve the exact product shape and visible condition, clean lint from the velvet, improve warm jewelry lighting, neutral cream background, no added gemstones, no brand marks, no text.`,
      `Create a livestream overlay hero image for ${product.title}: crop for a vertical product card, keep the original jewelry unchanged, crisp macro detail, soft reflections, premium vintage styling.`,
      `Create one alternate catalog angle for ${product.title}: use the supplied product photo as source, make the product easier to inspect, keep age-related patina visible, do not invent certificates or packaging.`
    ]
  }));
}

export function buildSellerDropFolderExtraction(
  folder = DEFAULT_SELLER_DROP_FOLDER
): PrepExtractionResult {
  const dropAssets = discoverSellerDropFolderAssets(folder);
  const products = vintageJewelryProducts.map((product) => ProductRecordSchema.parse(product));
  const session = LiveSessionSpecSchema.parse(vintageJewelryLiveSessionSpec);

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
