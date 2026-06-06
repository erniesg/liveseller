import { existsSync } from "node:fs";
import {
  DEFAULT_SELLER_DROP_FOLDER,
  buildSeedExtraction,
  buildSellerDropFolderExtraction
} from "./index";

const seedResult = buildSeedExtraction();
const sellerDropResult = existsSync(DEFAULT_SELLER_DROP_FOLDER)
  ? buildSellerDropFolderExtraction(DEFAULT_SELLER_DROP_FOLDER)
  : undefined;

console.log(
  JSON.stringify(
    {
      seed: summarize(seedResult),
      sellerDrop: sellerDropResult
        ? {
            ...summarize(sellerDropResult),
            folder: DEFAULT_SELLER_DROP_FOLDER,
            sellerGuidance: sellerDropResult.sellerGuidance.map((guidance) => ({
              productId: guidance.productId,
              talkTrack: guidance.talkTrack,
              likelyBuyerQuestions: guidance.likelyBuyerQuestions
            })),
            imageGenerationPlan: sellerDropResult.imageGenerationPlan.map((plan) => ({
              productId: plan.productId,
              model: plan.model,
              promptCount: plan.prompts.length
            }))
          }
        : undefined
    },
    null,
    2
  )
);

function summarize(result: ReturnType<typeof buildSeedExtraction>) {
  return {
    sessionId: result.liveSessionSpec.sessionId,
    products: result.products.map((product) => ({
      id: product.id,
      sku: product.sku,
      price: product.price,
      stock: product.stock,
      imageCount: product.media.images.length
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
  };
}
