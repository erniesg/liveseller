import {
  LiveSessionSpecSchema,
  ProductRecordSchema,
  PromoRecordSchema
} from "@liveseller/contracts";
import {
  buildMissingFieldReport,
  buildSeedExtraction,
  readSeedDocuments
} from "../src/index";

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
});
