import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type EvidenceCitation,
  type ProductRecord,
  AiDraftUpdateSchema,
  LiveSessionSpecSchema,
  ProductReviewPlanSchema,
  ProductRecordSchema,
  PromoRecordSchema,
  seedCitation,
  validProducts,
  vintageJewelryLiveSessionSpec
} from "@liveseller/contracts";
import {
  buildSellerDropFolderExtraction,
  buildSellerMaterialIngestion,
  buildMissingFieldReport,
  applyAiDraftUpdate,
  runPendingPrepGenerationTasks,
  discoverSellerDropFolderAssets,
  buildSeedExtraction,
  readSeedDocuments
} from "../src/index";
import { buildPrepDemoPayload } from "../src/demo";

const sellerDropFileNames = [
  "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰.jpg",
  "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰 (1).jpg",
  "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰 (2).jpg",
  "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰 (3).jpg",
  "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰 (4).jpg",
  "新品又上一组。#中古饰品 #中古首饰 #中古首饰直播 #中古首饰vintage #中古风.jpg",
  "新品又上一组。#中古饰品 #中古首饰 #中古首饰直播 #中古首饰vintage #中古风 (1).jpg",
  "新品又上一组。#中古饰品 #中古首饰 #中古首饰直播 #中古首饰vintage #中古风 (2).jpg",
  "新品又上一组。#中古饰品 #中古首饰 #中古首饰直播 #中古首饰vintage #中古风 (3).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享.jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (1).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (2).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (3).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (4).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (5).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (6).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (7).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (8).jpg",
  "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (9).jpg"
];

function createSellerDropFolderFixture() {
  const folder = mkdtempSync(join(tmpdir(), "liveseller-drop-"));
  for (const fileName of sellerDropFileNames) {
    writeFileSync(join(folder, fileName), "fixture image bytes");
  }
  return folder;
}

function dropImageCitation(fileName: string): EvidenceCitation {
  return {
    sourceId: "test-drop",
    sourceType: "image",
    locator: `apps/overlay/public/assets/products/test/${fileName}`,
    excerpt: `Seller supplied product photo copied from drop-folder file: ${fileName}`,
    confidence: 0.9
  };
}

function customDropProduct(fileNames: string[]): ProductRecord {
  return {
    ...validProducts[0]!,
    id: "prod-custom-camera-strap",
    sku: "LS-CUSTOM-STRAP-001",
    title: "Custom Camera Strap",
    aliases: ["camera strap", "strap"],
    category: "Camera Accessories",
    description: "Adjustable strap with stitched detail for live catalog testing.",
    media: {
      images: fileNames.map((fileName, index) => ({
        id: `custom-strap-${index + 1}`,
        uri: `/assets/products/test/custom-strap-${index + 1}.jpg`,
        alt: `Custom camera strap angle ${index + 1}`,
        citations: [dropImageCitation(fileName)]
      })),
      videos: []
    },
    evidence: [seedCitation],
    listingDraft: {
      title: "Custom Camera Strap",
      description: "Adjustable stitched camera strap.",
      bulletPoints: ["Adjustable strap", "Structured fixture product", "Human validation required"]
    }
  };
}

describe("prep catalog brain", () => {
  it("reads the seed folder used as the local upload fixture", () => {
    const docs = readSeedDocuments();
    expect(docs["product-notes.md"]).toContain("Bamboo Cooling Tee");
    expect(docs["policy-notes.md"]).toContain("refund");
    expect(docs["promo-notes.csv"]).toContain("promo-flash-10");
  });

  it("produces the lane 1 done artifact set", () => {
    const result = buildSeedExtraction();

    expect(result.products).toHaveLength(3);
    expect(result.promos).toHaveLength(1);
    expect(result.policyPack.safeFaq.length).toBeGreaterThan(0);
    expect(result.assets.length).toBeGreaterThanOrEqual(7);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.missingFieldReport.marketplaceReadiness).toBe("needs_seller_review");
    expect(() => LiveSessionSpecSchema.parse(result.liveSessionSpec)).not.toThrow();
  });

  it("keeps price, stock, variants, and promo eligibility structured", () => {
    const result = buildSeedExtraction();

    for (const product of result.products) {
      expect(() => ProductRecordSchema.parse(product)).not.toThrow();
      expect(typeof product.price).toBe("number");
      expect(typeof product.stock).toBe("number");
      expect(product.variants.length).toBeGreaterThan(0);
    }

    const promo = result.promos[0]!;
    expect(() => PromoRecordSchema.parse(promo)).not.toThrow();
    expect(promo.eligibleProductIds).toEqual(result.products.map((product) => product.id));
  });

  it("reports missing Shopee fields without blocking the mock demo", () => {
    const result = buildSeedExtraction();
    const report = buildMissingFieldReport(result.products);

    expect(report.missingByProduct).toHaveLength(3);
    expect(report.missingByProduct.every((row) => row.missingFields.includes("shopeeProductId"))).toBe(
      true
    );
  });

  it("discovers product images from the seller drop folder", () => {
    const sellerDropFolder = createSellerDropFolderFixture();
    const assets = discoverSellerDropFolderAssets(sellerDropFolder);

    expect(assets.images).toHaveLength(19);
    expect(assets.groups.map((group) => group.productId)).toEqual([
      "prod-vintage-gold-grape-leaf-brooch",
      "prod-vintage-blue-stone-bar-brooch",
      "prod-vintage-cameo-brooch"
    ]);
    expect(assets.groups.map((group) => group.imageFiles.length)).toEqual([5, 4, 10]);
  });

  it("discovers arbitrary seller-drop products from product image citations", () => {
    const folder = mkdtempSync(join(tmpdir(), "liveseller-custom-drop-"));
    const fileNames = ["custom-strap.jpg", "custom-strap (1).jpg"];
    for (const fileName of fileNames) {
      writeFileSync(join(folder, fileName), "fixture image bytes");
    }

    const assets = discoverSellerDropFolderAssets(folder, [customDropProduct(fileNames)]);

    expect(assets.images.map((image) => image.fileName)).toEqual(fileNames);
    expect(assets.groups).toEqual([
      expect.objectContaining({
        productId: "prod-custom-camera-strap",
        label: "Custom Camera Strap",
        imageFiles: expect.arrayContaining([
          expect.objectContaining({ productImageId: "custom-strap-1" }),
          expect.objectContaining({ productImageId: "custom-strap-2" })
        ])
      })
    ]);
  });

  it("builds a shared seller-drop LiveSessionSpec with guidance and image generation prompts", () => {
    const sellerDropFolder = createSellerDropFolderFixture();
    const result = buildSellerDropFolderExtraction(sellerDropFolder);

    expect(result.products).toHaveLength(3);
    expect(result.assets.filter((asset) => asset.kind === "product_image")).toHaveLength(19);
    expect(result.sellerGuidance).toHaveLength(3);
    expect(result.imageGenerationPlan).toHaveLength(3);
    expect(result.imageGenerationPlan.every((plan) => plan.model === "gpt-image-2")).toBe(true);
    expect(result.imageGenerationPlan[0]?.prompts.some((prompt) => prompt.includes("Shopee-ready square cover"))).toBe(
      true
    );
    expect(result.sellerGuidance[0]?.talkTrack).toContain("grape");
    expect(() => LiveSessionSpecSchema.parse(result.liveSessionSpec)).not.toThrow();
  });

  it("builds seller-drop extraction for a supplied product fixture set", () => {
    const folder = mkdtempSync(join(tmpdir(), "liveseller-custom-extraction-"));
    const fileNames = ["custom-strap.jpg", "custom-strap (1).jpg"];
    for (const fileName of fileNames) {
      writeFileSync(join(folder, fileName), "fixture image bytes");
    }

    const product = customDropProduct(fileNames);
    const result = buildSellerDropFolderExtraction(folder, {
      products: [product],
      liveSessionSpec: {
        ...vintageJewelryLiveSessionSpec,
        sessionId: "live-custom-drop-001",
        products: [product]
      }
    });

    expect(result.liveSessionSpec.products).toHaveLength(1);
    expect(result.assets.filter((asset) => asset.kind === "product_image")).toHaveLength(2);
    expect(result.sellerGuidance[0]?.talkTrack).toContain("Custom Camera Strap");
    expect(result.imageGenerationPlan[0]?.sourceImageUris).toEqual(product.media.images.map((image) => image.uri));
    expect(result.imageGenerationPlan[0]?.prompts.join(" ")).toContain("Camera Accessories");
    expect(() => LiveSessionSpecSchema.parse(result.liveSessionSpec)).not.toThrow();
  });

  it("ingests seller material into product identity, photo plans, and seller UI policy", () => {
    const folder = mkdtempSync(join(tmpdir(), "liveseller-material-"));
    const fileNames = ["custom-strap.jpg", "custom-strap (1).jpg"];
    for (const fileName of fileNames) {
      writeFileSync(join(folder, fileName), "fixture image bytes");
    }
    writeFileSync(join(folder, "seller-notes.md"), "# Camera strap\nConfirm strap length on camera.");

    const product = customDropProduct(fileNames);
    const result = buildSellerMaterialIngestion(folder, {
      products: [product],
      liveSessionSpec: {
        ...vintageJewelryLiveSessionSpec,
        sessionId: "live-custom-material-001",
        products: [product]
      }
    });

    expect(result.ingestedFiles.map((file) => file.kind).sort()).toEqual(["document", "image", "image"]);
    expect(result.productIdentityDrafts).toEqual([
      expect.objectContaining({
        productId: "prod-custom-camera-strap",
        title: "Custom Camera Strap",
        sku: "LS-CUSTOM-STRAP-001",
        imageCount: 2,
        identitySource: "structured_fixture",
        missingFields: ["shopeeProductId"]
      })
    ]);
    expect(result.photoEnhancementPlan[0]).toMatchObject({
      productId: "prod-custom-camera-strap",
      model: "gpt-image-2",
      sourceImageUris: product.media.images.map((image) => image.uri)
    });
    expect(result.sellerUiPolicy).toMatchObject({
      sessionId: "live-custom-material-001",
      status: "seller_review_required",
      publicAutomation: {
        autoSend: "low_risk_structured_only"
      }
    });
    expect(result.sellerUiPolicy.products[0]).toMatchObject({
      productId: "prod-custom-camera-strap",
      reviewRequired: true,
      imageCount: 2
    });
    expect(() => ProductReviewPlanSchema.parse(result.productReviewPlan)).not.toThrow();
    expect(result.productReviewPlan.items[0]).toMatchObject({
      productId: "prod-custom-camera-strap",
      decision: {
        status: "pending"
      },
      reviewRounds: [
        expect.objectContaining({
          freeFormResponseMode: "enabled",
          options: expect.arrayContaining([
            expect.objectContaining({ intent: "approve_as_is" }),
            expect.objectContaining({ intent: "request_edit" })
          ])
        })
      ],
      lockedStructuredFields: expect.arrayContaining(["sku", "price", "stock", "variants", "promoEligibility"]),
      aiUpdatableFields: expect.arrayContaining([
        "title",
        "listingDraft",
        "sellerGuidance",
        "photoEnhancementPrompts"
      ])
    });
    expect(result.productReviewPlan.generationTasks.filter((task) => task.taskType === "image_edit")).toHaveLength(2);
  });

  it("builds a reviewable seller material plan from one product image", () => {
    const folder = mkdtempSync(join(tmpdir(), "liveseller-one-image-"));
    const fileNames = ["custom-strap.jpg"];
    writeFileSync(join(folder, fileNames[0]!), "fixture image bytes");

    const product = customDropProduct(fileNames);
    const result = buildSellerMaterialIngestion(folder, {
      products: [product],
      liveSessionSpec: {
        ...vintageJewelryLiveSessionSpec,
        sessionId: "live-one-image-material-001",
        products: [product]
      }
    });

    expect(result.products).toHaveLength(1);
    expect(result.productReviewPlan.items[0]?.product.media.images).toHaveLength(1);
    expect(result.productReviewPlan.items[0]?.reviewRounds[0]?.options.length).toBeGreaterThanOrEqual(2);
    expect(result.productReviewPlan.generationTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: "prod-custom-camera-strap",
          taskType: "image_edit",
          status: "pending"
        })
      ])
    );
  });

  it("applies AI draft updates without changing locked structured product facts", () => {
    const folder = mkdtempSync(join(tmpdir(), "liveseller-material-update-"));
    const fileNames = ["custom-strap.jpg", "custom-strap (1).jpg"];
    for (const fileName of fileNames) {
      writeFileSync(join(folder, fileName), "fixture image bytes");
    }

    const product = customDropProduct(fileNames);
    const result = buildSellerMaterialIngestion(folder, {
      products: [product],
      liveSessionSpec: {
        ...vintageJewelryLiveSessionSpec,
        sessionId: "live-custom-material-update-001",
        products: [product]
      }
    });
    const update = AiDraftUpdateSchema.parse({
      updateId: "ai-update-custom-strap-001",
      productId: "prod-custom-camera-strap",
      actor: "ai",
      updatedAt: "2026-06-06T02:10:00.000Z",
      reason: "Improve review draft wording while preserving structured facts.",
      citations: product.evidence,
      patch: {
        title: "Custom Camera Strap - Seller Review Draft",
        listingDraft: {
          title: "Custom Camera Strap - Seller Review Draft",
          description: "Adjustable stitched camera strap prepared for seller review.",
          bulletPoints: ["Adjustable strap", "Seller should confirm length", "Structured price unchanged"]
        },
        sellerGuidance: {
          talkTrack: "Show stitching, attachment points, and strap length before quoting details.",
          researchNotes: ["Length remains seller-confirmation only."],
          likelyBuyerQuestions: ["How long is it?", "Will it fit my camera?"],
          riskNotes: ["Compatibility claims require seller confirmation."]
        },
        photoEnhancementPrompts: [
          "Create a square Shopee cover that preserves the exact strap shape and stitching."
        ]
      }
    });

    const updatedPlan = applyAiDraftUpdate(result.productReviewPlan, update);

    expect(updatedPlan.items[0]?.identityDraft.title).toBe("Custom Camera Strap - Seller Review Draft");
    expect(updatedPlan.items[0]?.product.price).toBe(product.price);
    expect(updatedPlan.items[0]?.product.stock).toBe(product.stock);
    expect(updatedPlan.items[0]?.product.sku).toBe(product.sku);
    expect(updatedPlan.items[0]?.photoEnhancementPlan.prompts).toEqual(update.patch.photoEnhancementPrompts);
  });

  it("runs pending image-edit prep generation tasks in parallel and waits for completion", async () => {
    const folder = mkdtempSync(join(tmpdir(), "liveseller-material-parallel-"));
    const fileNames = ["custom-strap.jpg", "custom-strap (1).jpg"];
    for (const fileName of fileNames) {
      writeFileSync(join(folder, fileName), "fixture image bytes");
    }

    const product = customDropProduct(fileNames);
    const result = buildSellerMaterialIngestion(folder, {
      products: [product],
      liveSessionSpec: {
        ...vintageJewelryLiveSessionSpec,
        sessionId: "live-parallel-material-001",
        products: [product]
      }
    });
    let active = 0;
    let maxActive = 0;

    const completedPlan = await runPendingPrepGenerationTasks(
      result.productReviewPlan,
      async (task) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return {
          outputRefs: [`generated://${task.taskId}`],
          citations: task.citations
        };
      },
      "2026-06-06T02:20:00.000Z"
    );

    expect(maxActive).toBeGreaterThan(1);
    expect(completedPlan.generationTasks.filter((task) => task.taskType === "image_edit")).toEqual([
      expect.objectContaining({ status: "completed" }),
      expect.objectContaining({ status: "completed" })
    ]);
  });

  it("surfaces actual seller fixtures in the prep demo instead of seed products", () => {
    const sellerDropFolder = createSellerDropFolderFixture();
    const payload = buildPrepDemoPayload(sellerDropFolder);

    expect(payload.sellerMaterial.products).toHaveLength(3);
    expect(payload.sellerMaterial.products.map((product) => product.id)).toEqual([
      "prod-vintage-gold-grape-leaf-brooch",
      "prod-vintage-blue-stone-bar-brooch",
      "prod-vintage-cameo-brooch"
    ]);
    expect("seed" in payload).toBe(false);
    expect(payload.sellerMaterial.sellerUiPolicy.status).toBe("seller_review_required");
  });
});
