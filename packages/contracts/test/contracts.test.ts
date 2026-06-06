import {
  AUDIT_JSONL_CONTRACT,
  AuditEventSchema,
  ContextEnvelopeSchema,
  LiveActionSchema,
  LiveSessionSpecSchema,
  OverlayStateSchema,
  ProductRecordSchema,
  PromoRecordSchema,
  RuntimeEventSchema,
  SQLITE_SCHEMA,
  SessionMemorySchema,
  ViewerMemorySchema,
  badFixtures,
  validAuditEvent,
  validLiveAction,
  validLiveSessionSpec,
  validOverlayState,
  validProducts,
  validPromo,
  validRuntimeEvents,
  validSessionMemory,
  validViewerMemory
} from "@liveseller/contracts";

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
  });

  it("rejects invalid or private contract payloads", () => {
    expect(() => ProductRecordSchema.parse(badFixtures.negativeStockProduct)).toThrow();
    expect(() => LiveActionSchema.parse(badFixtures.privateLiveActionPayload)).toThrow();
    expect(() => LiveActionSchema.parse(badFixtures.mismatchedActionPayload)).toThrow();
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
    expect(SQLITE_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS approvals");
    expect(SQLITE_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS commands");
    expect(AUDIT_JSONL_CONTRACT.filePattern).toBe("audit/{sessionId}.jsonl");
  });
});
