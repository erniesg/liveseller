import { existsSync } from "node:fs";
import {
  DEFAULT_SELLER_DROP_FOLDER,
  type SellerMaterialIngestionResult,
  buildSellerMaterialIngestion
} from "./index";

export type PrepDemoPayload = {
  sellerMaterial: ReturnType<typeof summarizeSellerMaterial>;
};

export function buildPrepDemoPayload(
  sellerMaterialPath = DEFAULT_SELLER_DROP_FOLDER
): PrepDemoPayload {
  if (!existsSync(sellerMaterialPath)) {
    throw new Error(`Seller material folder not found: ${sellerMaterialPath}`);
  }

  return {
    sellerMaterial: summarizeSellerMaterial(
      buildSellerMaterialIngestion(sellerMaterialPath),
      sellerMaterialPath
    )
  };
}

function summarizeSellerMaterial(result: SellerMaterialIngestionResult, folder: string) {
  return {
    folder,
    sessionId: result.liveSessionSpec.sessionId,
    ingestedFiles: result.ingestedFiles.map((file) => ({
      fileName: file.fileName,
      kind: file.kind,
      sizeBytes: file.sizeBytes
    })),
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
    assets: result.assets.length,
    productIdentityDrafts: result.productIdentityDrafts.map((draft) => ({
      productId: draft.productId,
      title: draft.title,
      sku: draft.sku,
      price: draft.price,
      stock: draft.stock,
      imageCount: draft.imageCount,
      missingFields: draft.missingFields
    })),
    sellerGuidance: result.sellerGuidance.map((guidance) => ({
      productId: guidance.productId,
      talkTrack: guidance.talkTrack,
      likelyBuyerQuestions: guidance.likelyBuyerQuestions
    })),
    photoEnhancementPlan: result.photoEnhancementPlan.map((plan) => ({
      productId: plan.productId,
      model: plan.model,
      sourceImageCount: plan.sourceImageUris.length,
      promptCount: plan.prompts.length
    })),
    sellerUiPolicy: result.sellerUiPolicy,
    productReviewPlan: {
      reviewPlanId: result.productReviewPlan.reviewPlanId,
      status: result.productReviewPlan.status,
      products: result.productReviewPlan.items.map((item) => ({
        productId: item.productId,
        decisionStatus: item.decision.status,
        reviewRoundCount: item.reviewRounds.length,
        reviewOptions: item.reviewRounds.at(-1)?.options.map((option) => ({
          label: option.label,
          intent: option.intent
        })),
        aiUpdatableFields: item.aiUpdatableFields,
        lockedStructuredFields: item.lockedStructuredFields
      })),
      generationTasks: result.productReviewPlan.generationTasks.map((task) => ({
        taskId: task.taskId,
        productId: task.productId,
        taskType: task.taskType,
        status: task.status
      }))
    }
  };
}

if (process.argv[1]?.endsWith("demo.ts")) {
  console.log(JSON.stringify(buildPrepDemoPayload(), null, 2));
}
