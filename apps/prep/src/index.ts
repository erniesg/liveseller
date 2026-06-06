import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
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
  validPromo
} from "@liveseller/contracts";

const currentDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SEED_FOLDER = join(currentDir, "..", "seed");

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

export type PrepExtractionResult = {
  products: ProductRecord[];
  promos: PromoRecord[];
  policyPack: PolicyPack;
  citations: EvidenceCitation[];
  assets: PrepAsset[];
  missingFieldReport: MissingFieldReport;
  liveSessionSpec: LiveSessionSpec;
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

export function buildMissingFieldReport(products: ProductRecord[]): MissingFieldReport {
  return {
    sessionId: validLiveSessionSpec.sessionId,
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
    liveSessionSpec
  };
}
