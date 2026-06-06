import {
  AUDIT_JSONL_CONTRACT,
  AiDraftUpdateSchema,
  AuditEventSchema,
  ContextEnvelopeSchema,
  LiveActionSchema,
  LiveSessionSpecSchema,
  OverlayStateSchema,
  PrepGenerationTaskSchema,
  ProductReviewPlanSchema,
  ProductRecordSchema,
  PromoRecordSchema,
  RuntimeEventSchema,
  SQLITE_SCHEMA,
  SellerFreeFormReviewResponseSchema,
  SessionMemorySchema,
  ShopeeCreateProductCommandSchema,
  ShopeeStartLivestreamCommandSchema,
  ViewerMemorySchema,
  badFixtures,
  validAiDraftUpdate,
  validAuditEvent,
  validLiveAction,
  validLiveSessionSpec,
  validOverlayState,
  validProductReviewPlan,
  validProducts,
  validPromo,
  validRuntimeEvents,
  validSellerFreeFormReviewResponse,
  validShopeeCreateProductCommand,
  validShopeeStartLivestreamCommand,
  validSessionMemory,
  validViewerMemory,
  vintageJewelryLiveSessionSpec,
  vintageJewelryProducts,
  vintageJewelrySessionMemory
} from "@liveseller/contracts";
import { existsSync } from "node:fs";

describe("contract freeze", () => {
  it("accepts all shared valid fixtures", () => {
    expect(() => validProducts.forEach((product) => ProductRecordSchema.parse(product))).not.toThrow();
    expect(() => PromoRecordSchema.parse(validPromo)).not.toThrow();
    expect(() => LiveSessionSpecSchema.parse(validLiveSessionSpec)).not.toThrow();
    expect(() => validRuntimeEvents.forEach((event) => RuntimeEventSchema.parse(event))).not.toThrow();
    expect(() => LiveActionSchema.parse(validLiveAction)).not.toThrow();
    expect(() => AuditEventSchema.parse(validAuditEvent)).not.toThrow();
    expect(() => OverlayStateSchema.parse(validOverlayState)).not.toThrow();
    expect(() => ViewerMemorySchema.parse(validViewerMemory)).not.toThrow();
    expect(() => SessionMemorySchema.parse(validSessionMemory)).not.toThrow();
    expect(() => ProductReviewPlanSchema.parse(validProductReviewPlan)).not.toThrow();
    expect(() => AiDraftUpdateSchema.parse(validAiDraftUpdate)).not.toThrow();
    expect(() => SellerFreeFormReviewResponseSchema.parse(validSellerFreeFormReviewResponse)).not.toThrow();
    expect(() => {
      validProductReviewPlan.generationTasks.forEach((task) => PrepGenerationTaskSchema.parse(task));
    }).not.toThrow();
    expect(() => ShopeeCreateProductCommandSchema.parse(validShopeeCreateProductCommand)).not.toThrow();
    expect(() => ShopeeStartLivestreamCommandSchema.parse(validShopeeStartLivestreamCommand)).not.toThrow();
  });

  it("rejects invalid or private contract payloads", () => {
    expect(() => ProductRecordSchema.parse(badFixtures.negativeStockProduct)).toThrow();
    expect(() => LiveActionSchema.parse(badFixtures.privateLiveActionPayload)).toThrow();
    expect(() => LiveActionSchema.parse(badFixtures.mismatchedActionPayload)).toThrow();
    expect(() => AiDraftUpdateSchema.parse(badFixtures.aiDraftUpdateChangesLockedPrice)).toThrow();
    expect(() => ProductReviewPlanSchema.parse(badFixtures.productReviewPlanIdMismatch)).toThrow();
    expect(() => ProductReviewPlanSchema.parse(badFixtures.editedDecisionWithoutEditedProduct)).toThrow();
    expect(() => ProductReviewPlanSchema.parse(badFixtures.productReviewPlanWithoutOptions)).toThrow();
  });

  it("freezes review-to-publish safety contracts", () => {
    expect(validProductReviewPlan.items[0]?.decision.status).toBe("pending");
    expect(validProductReviewPlan.items[0]?.aiUpdatableFields).toEqual(
      expect.arrayContaining(["title", "listingDraft", "sellerGuidance", "photoEnhancementPrompts"])
    );
    expect(validProductReviewPlan.items[0]?.lockedStructuredFields).toEqual(
      expect.arrayContaining(["sku", "price", "stock", "variants", "promoEligibility"])
    );
    expect(validProductReviewPlan.items[0]?.reviewRounds[0]).toMatchObject({
      freeFormResponseMode: "enabled",
      options: expect.arrayContaining([
        expect.objectContaining({ intent: "approve_as_is" }),
        expect.objectContaining({ intent: "request_edit" })
      ])
    });
    expect(validProductReviewPlan.generationTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: validProducts[0]!.id,
          taskType: "image_edit",
          status: "pending"
        })
      ])
    );
    expect(validShopeeCreateProductCommand).toMatchObject({
      kind: "create_product",
      approvalStatus: "approved",
      productId: validProducts[0]!.id
    });
    expect(validShopeeCreateProductCommand.payload.product.price).toBe(validProducts[0]!.price);
    expect(validShopeeCreateProductCommand.payload.product.stock).toBe(validProducts[0]!.stock);
  });

  it("keeps livestream setup commands free of RTMP secrets", () => {
    expect(validShopeeStartLivestreamCommand).toMatchObject({
      kind: "prepare_livestream",
      approvalStatus: "approved",
      safetyMode: "dry_run"
    });
    expect(JSON.stringify(validShopeeStartLivestreamCommand).toLowerCase()).not.toContain("streamkey");
    expect(JSON.stringify(validShopeeStartLivestreamCommand).toLowerCase()).not.toContain("rtmp://");
    expect(() =>
      ShopeeStartLivestreamCommandSchema.parse({
        ...validShopeeStartLivestreamCommand,
        payload: {
          ...validShopeeStartLivestreamCommand.payload,
          streamKey: "raw-secret-key"
        }
      })
    ).toThrow();
  });

  it("validates a context envelope assembled by another lane", () => {
    const envelope = {
      contextId: "ctx-contract-smoke",
      event: validRuntimeEvents[0]!,
      session: validLiveSessionSpec,
      currentProductId: validProducts[0]!.id,
      currentPromoId: validPromo.id,
      viewerMemory: validViewerMemory,
      sessionMemory: validSessionMemory,
      retrievalCitations: validProducts[0]!.evidence,
      structuredFacts: {
        productIds: [validProducts[0]!.id],
        promoIds: [validPromo.id],
        canonicalFields: ["price", "stock", "variants", "sku", "promoEligibility"]
      },
      policyFlags: []
    };

    expect(() => ContextEnvelopeSchema.parse(envelope)).not.toThrow();
  });

  it("declares the local storage and immutable audit contracts", () => {
    expect(SQLITE_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS products");
    expect(SQLITE_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS product_review_plans");
    expect(SQLITE_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS approvals");
    expect(SQLITE_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS commands");
    expect(AUDIT_JSONL_CONTRACT.filePattern).toBe("audit/{sessionId}.jsonl");
  });

  it("shares the vintage jewelry seller-drop fixtures across lanes", () => {
    expect(vintageJewelryProducts).toHaveLength(3);
    expect(() => vintageJewelryProducts.forEach((product) => ProductRecordSchema.parse(product))).not.toThrow();
    expect(() => LiveSessionSpecSchema.parse(vintageJewelryLiveSessionSpec)).not.toThrow();
    expect(() => SessionMemorySchema.parse(vintageJewelrySessionMemory)).not.toThrow();
    expect(vintageJewelryLiveSessionSpec.products.map((product) => product.id)).toEqual(
      vintageJewelryProducts.map((product) => product.id)
    );
    expect(vintageJewelryProducts.every((product) => product.media.images.length > 0)).toBe(true);
    expect(vintageJewelrySessionMemory.recommendations.some((note) => note.includes("cameo"))).toBe(true);
  });

  it("keeps shared fixture asset locators portable across machines", () => {
    const imageLocators = vintageJewelryProducts.flatMap((product) =>
      product.media.images.flatMap((image) => image.citations.map((citation) => citation.locator))
    );
    const publicAssetPaths = vintageJewelryProducts.flatMap((product) =>
      product.media.images.map((image) => image.uri.replace(/^\//u, "apps/overlay/public/"))
    );

    expect(imageLocators.every((locator) => locator.startsWith("apps/prep/fixtures/seller-drop/"))).toBe(true);
    expect(imageLocators.every((locator) => !locator.includes("/Users/"))).toBe(true);
    expect(imageLocators.every((locator) => existsSync(locator))).toBe(true);
    expect(publicAssetPaths.every((assetPath) => existsSync(assetPath))).toBe(true);
  });
});
