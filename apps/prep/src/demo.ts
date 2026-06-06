import { buildSeedExtraction } from "./index";

const result = buildSeedExtraction();

console.log(
  JSON.stringify(
    {
      sessionId: result.liveSessionSpec.sessionId,
      products: result.products.map((product) => ({
        id: product.id,
        sku: product.sku,
        price: product.price,
        stock: product.stock
      })),
      promos: result.promos.map((promo) => ({
        id: promo.id,
        title: promo.title,
        remainingQuantity: promo.remainingQuantity,
        source: promo.source
      })),
      policyPack: result.policyPack.id,
      missingFieldReport: result.missingFieldReport,
      assets: result.assets.length
    },
    null,
    2
  )
);
