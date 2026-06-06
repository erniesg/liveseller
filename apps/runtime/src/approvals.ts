import {
  type ProductReviewDecision,
  type ProductReviewPlan,
  type SellerFreeFormReviewResponse,
  type SellerReviewRound,
  type LiveSessionSpec,
  type ShopeeCreateProductCommand,
  type ShopeeStartLivestreamCommand,
  ProductReviewDecisionSchema,
  ProductReviewPlanSchema,
  SellerFreeFormReviewResponseSchema,
  ShopeeCreateProductCommandSchema,
  ShopeeStartLivestreamCommandSchema
} from "@liveseller/contracts";

function reviewPlanStatus(items: ProductReviewPlan["items"]): ProductReviewPlan["status"] {
  const decisions = items.map((item) => item.decision.status);
  const publishable = decisions.filter((status) => status === "approved" || status === "edited").length;
  const rejected = decisions.filter((status) => status === "rejected").length;

  if (publishable === items.length) {
    return "ready_for_publish";
  }
  if (rejected === items.length) {
    return "rejected";
  }
  if (publishable > 0) {
    return "partially_approved";
  }
  return "seller_review_required";
}

export function recordProductReviewDecision(
  plan: ProductReviewPlan,
  decision: ProductReviewDecision
): ProductReviewPlan {
  const parsedDecision = ProductReviewDecisionSchema.parse(decision);
  if (parsedDecision.editedProduct && parsedDecision.editedProduct.id !== parsedDecision.productId) {
    throw new Error("Edited product id must match the reviewed product");
  }

  let found = false;
  const items = plan.items.map((item) => {
    if (item.productId !== parsedDecision.productId) {
      return item;
    }

    found = true;
    const product = parsedDecision.status === "edited" && parsedDecision.editedProduct
      ? parsedDecision.editedProduct
      : item.product;

    return {
      ...item,
      product,
      decision: parsedDecision
    };
  });

  if (!found) {
    throw new Error(`Cannot record decision for unknown product: ${parsedDecision.productId}`);
  }

  return ProductReviewPlanSchema.parse({
    ...plan,
    updatedAt: parsedDecision.decidedAt ?? plan.updatedAt,
    status: reviewPlanStatus(items),
    items
  });
}

function buildFollowUpReviewRound(
  productId: string,
  roundCount: number,
  proposedAt: string,
  sellerText: string
): SellerReviewRound {
  const roundNumber = roundCount + 1;

  return {
    roundId: `round-${productId}-${String(roundNumber).padStart(3, "0")}`,
    productId,
    proposedAt,
    prompt: `Seller feedback: ${sellerText}. Choose an option or reply freely with more edits.`,
    options: [
      {
        optionId: `option-${productId}-${roundNumber}-approve`,
        label: "Approve revised draft",
        description: "Proceed with the latest structured product facts and revised draft.",
        intent: "approve_as_is"
      },
      {
        optionId: `option-${productId}-${roundNumber}-edit`,
        label: "Request another edit",
        description: "Reply freely with the exact change needed before publishing.",
        intent: "request_edit"
      },
      {
        optionId: `option-${productId}-${roundNumber}-more-options`,
        label: "More options",
        description: "Ask the agent to propose another set of listing or image directions.",
        intent: "request_more_options"
      }
    ],
    freeFormResponseMode: "enabled"
  };
}

export function recordSellerReviewResponse(
  plan: ProductReviewPlan,
  response: SellerFreeFormReviewResponse,
  receivedAt = response.receivedAt
): ProductReviewPlan {
  const parsedResponse = SellerFreeFormReviewResponseSchema.parse(response);
  let found = false;

  const items = plan.items.map((item) => {
    if (item.productId !== parsedResponse.productId) {
      return item;
    }

    const roundIndex = item.reviewRounds.findIndex((round) => round.roundId === parsedResponse.roundId);
    if (roundIndex === -1) {
      return item;
    }

    found = true;
    const reviewRounds = item.reviewRounds.map((round, index) =>
      index === roundIndex
        ? {
            ...round,
            response: parsedResponse
          }
        : round
    );

    if (
      parsedResponse.interpretedIntent === "edit_request" ||
      parsedResponse.interpretedIntent === "more_options" ||
      parsedResponse.interpretedIntent === "unknown"
    ) {
      reviewRounds.push(
        buildFollowUpReviewRound(
          item.productId,
          reviewRounds.length,
          receivedAt,
          parsedResponse.text
        )
      );
    }

    return {
      ...item,
      reviewRounds
    };
  });

  if (!found) {
    throw new Error(`Cannot record review response for unknown round: ${parsedResponse.roundId}`);
  }

  return ProductReviewPlanSchema.parse({
    ...plan,
    updatedAt: receivedAt,
    items
  });
}

export function buildShopeeCreateProductCommands(
  plan: ProductReviewPlan,
  createdAt = new Date().toISOString()
): ShopeeCreateProductCommand[] {
  return plan.items.flatMap((item) => {
    if (item.decision.status !== "approved" && item.decision.status !== "edited") {
      return [];
    }

    const product = item.decision.status === "edited" && item.decision.editedProduct
      ? item.decision.editedProduct
      : item.product;

    return [
      ShopeeCreateProductCommandSchema.parse({
        commandId: `cmd-create-${plan.sessionId}-${item.productId}`,
        sessionId: plan.sessionId,
        productId: item.productId,
        kind: "create_product",
        createdAt,
        approvalDecisionId: item.decision.decisionId,
        approvalStatus: item.decision.status,
        payload: {
          product
        },
        citations: [
          ...item.identityDraft.evidence,
          ...item.decision.citations
        ]
      })
    ];
  });
}

export function buildShopeeStartLivestreamCommands(
  plan: ProductReviewPlan,
  session: LiveSessionSpec,
  createdAt = new Date().toISOString()
): ShopeeStartLivestreamCommand[] {
  if (plan.status !== "ready_for_publish" || plan.sessionId !== session.sessionId) {
    return [];
  }

  const productIds = plan.items
    .filter((item) => item.decision.status === "approved" || item.decision.status === "edited")
    .map((item) => item.productId);

  if (productIds.length === 0) {
    return [];
  }

  return [
    ShopeeStartLivestreamCommandSchema.parse({
      commandId: `cmd-prepare-livestream-${session.sessionId}`,
      sessionId: session.sessionId,
      kind: "prepare_livestream",
      createdAt,
      approvalId: `approval-prepare-livestream-${session.sessionId}`,
      approvalStatus: "approved",
      safetyMode: "create_session_capture_credentials",
      payload: {
        title: session.title,
        productIds,
        publicOverlayUrl: `/?runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=${encodeURIComponent(session.sessionId)}`,
        shopeeSetupSteps: [
          "open_live_center",
          "create_live_session",
          "capture_stream_credentials",
          "bind_public_overlay_preview"
        ],
        streamCredentialHandling: "transient_capture_redacted_evidence",
        credentialEvidence: "redacted_presence_only",
        cameraPreviewRequired: true,
        goLive: false
      },
      citations: plan.citations
    })
  ];
}
