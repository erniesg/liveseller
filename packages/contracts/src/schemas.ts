import { z } from "zod";

export const LanguageCodeSchema = z.enum(["en", "zh", "ms", "ta"]);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

export const CurrencySchema = z.enum([
  "SGD",
  "MYR",
  "PHP",
  "THB",
  "IDR",
  "VND",
  "USD"
]);

export const RiskLevelSchema = z.enum(["low", "medium", "high", "blocked"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const EvidenceCitationSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceType: z.enum([
      "upload",
      "doc",
      "image",
      "sheet",
      "manual",
      "retrieval",
      "system"
    ]),
    locator: z.string().min(1),
    excerpt: z.string().min(1),
    confidence: z.number().min(0).max(1)
  })
  .strict();
export type EvidenceCitation = z.infer<typeof EvidenceCitationSchema>;

export const ProductVariantSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    sku: z.string().min(1),
    priceDelta: z.number(),
    stock: z.number().int().nonnegative(),
    attributes: z.record(z.string().min(1), z.string().min(1))
  })
  .strict();

export const ProductListingDraftSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    bulletPoints: z.array(z.string().min(1))
  })
  .strict();
export type ProductListingDraft = z.infer<typeof ProductListingDraftSchema>;

export const ProductRecordSchema = z
  .object({
    id: z.string().min(1),
    sku: z.string().min(1),
    shopeeProductId: z.string().min(1).optional(),
    title: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    category: z.string().min(1),
    description: z.string().min(1),
    price: z.number().nonnegative(),
    currency: CurrencySchema,
    variants: z.array(ProductVariantSchema),
    stock: z.number().int().nonnegative(),
    dimensions: z
      .object({
        weightGrams: z.number().positive(),
        lengthCm: z.number().positive(),
        widthCm: z.number().positive(),
        heightCm: z.number().positive()
      })
      .strict(),
    shipping: z
      .object({
        originCountry: z.string().min(2),
        shipWithinDays: z.number().int().positive(),
        supportedMethods: z.array(z.string().min(1)),
        freeShipping: z.boolean()
      })
      .strict(),
    returnPolicy: z
      .object({
        windowDays: z.number().int().nonnegative(),
        conditions: z.array(z.string().min(1)),
        exclusions: z.array(z.string().min(1))
      })
      .strict(),
    media: z
      .object({
        images: z.array(
          z
            .object({
              id: z.string().min(1),
              uri: z.string().min(1),
              alt: z.string().min(1),
              citations: z.array(EvidenceCitationSchema)
            })
            .strict()
        ),
        videos: z.array(z.string().min(1)).default([])
      })
      .strict(),
    evidence: z.array(EvidenceCitationSchema),
    sourceConfidence: z.number().min(0).max(1),
    listingDraft: ProductListingDraftSchema
  })
  .strict();
export type ProductRecord = z.infer<typeof ProductRecordSchema>;

export const PromoRecordSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["percentage", "fixed_amount", "bundle", "free_shipping"]),
    title: z.string().min(1),
    discount: z
      .object({
        value: z.number().positive(),
        currency: CurrencySchema.optional(),
        percent: z.number().positive().max(100).optional()
      })
      .strict(),
    minSpend: z.number().nonnegative(),
    eligibleProductIds: z.array(z.string().min(1)),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    remainingQuantity: z.number().int().nonnegative(),
    source: z.enum(["shopee", "seller_note", "manual", "runtime"]),
    riskNotes: z.array(z.string().min(1)),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict()
  .refine((promo) => new Date(promo.endAt) > new Date(promo.startAt), {
    message: "Promo endAt must be after startAt",
    path: ["endAt"]
  });
export type PromoRecord = z.infer<typeof PromoRecordSchema>;

export const PolicyPackSchema = z
  .object({
    id: z.string().min(1),
    market: z.string().min(2),
    languages: z.array(LanguageCodeSchema),
    safeFaq: z.array(
      z
        .object({
          id: z.string().min(1),
          question: z.string().min(1),
          answer: z.string().min(1),
          language: LanguageCodeSchema,
          citations: z.array(EvidenceCitationSchema)
        })
        .strict()
    ),
    shippingPolicy: z.string().min(1),
    returnPolicy: z.string().min(1),
    restrictedClaims: z.array(z.string().min(1)),
    escalationTriggers: z.array(z.string().min(1)),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict();
export type PolicyPack = z.infer<typeof PolicyPackSchema>;

export const SellerGuidanceSchema = z
  .object({
    productId: z.string().min(1),
    talkTrack: z.string().min(1),
    researchNotes: z.array(z.string().min(1)),
    likelyBuyerQuestions: z.array(z.string().min(1)),
    riskNotes: z.array(z.string().min(1))
  })
  .strict();
export type SellerGuidance = z.infer<typeof SellerGuidanceSchema>;

export const ImageGenerationPlanSchema = z
  .object({
    productId: z.string().min(1),
    model: z.literal("gpt-image-2"),
    sourceImageUris: z.array(z.string().min(1)),
    prompts: z.array(z.string().min(1))
  })
  .strict();
export type ImageGenerationPlan = z.infer<typeof ImageGenerationPlanSchema>;

export const ProductIdentityDraftSchema = z
  .object({
    productId: z.string().min(1),
    title: z.string().min(1),
    sku: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    category: z.string().min(1),
    price: z.number().nonnegative(),
    currency: CurrencySchema,
    stock: z.number().int().nonnegative(),
    variantCount: z.number().int().nonnegative(),
    imageCount: z.number().int().nonnegative(),
    sourceConfidence: z.number().min(0).max(1),
    identitySource: z.enum(["structured_fixture", "seller_upload", "manual"]),
    missingFields: z.array(z.string().min(1)),
    evidence: z.array(EvidenceCitationSchema)
  })
  .strict();
export type ProductIdentityDraft = z.infer<typeof ProductIdentityDraftSchema>;

export const SellerUiPolicySchema = z
  .object({
    sessionId: z.string().min(1),
    status: z.enum(["seller_review_required", "ready_for_live_review"]),
    products: z.array(
      z
        .object({
          productId: z.string().min(1),
          title: z.string().min(1),
          sku: z.string().min(1),
          priceLabel: z.string().min(1),
          stockLabel: z.string().min(1),
          imageCount: z.number().int().nonnegative(),
          missingFields: z.array(z.string().min(1)),
          reviewRequired: z.boolean()
        })
        .strict()
    ),
    photoEnhancement: z.array(
      z
        .object({
          productId: z.string().min(1),
          model: z.literal("gpt-image-2"),
          sourceImageCount: z.number().int().nonnegative(),
          promptCount: z.number().int().nonnegative(),
          requiresApproval: z.boolean()
        })
        .strict()
    ),
    publicAutomation: z
      .object({
        autoSend: z.literal("low_risk_structured_only"),
        approvalRequired: z.array(z.string().min(1)),
        blockedAutoSend: z.array(z.string().min(1))
      })
      .strict(),
    renderHints: z
      .object({
        sidePanelSectionId: z.literal("liveseller-prep-review"),
        productAttribute: z.literal("data-liveseller-product-id"),
        actionAttribute: z.literal("data-liveseller-action-id")
      })
      .strict()
  })
  .strict();
export type SellerUiPolicy = z.infer<typeof SellerUiPolicySchema>;

export const AiUpdatableReviewFieldSchema = z.enum([
  "title",
  "aliases",
  "category",
  "description",
  "listingDraft",
  "sellerGuidance",
  "photoEnhancementPrompts"
]);
export type AiUpdatableReviewField = z.infer<typeof AiUpdatableReviewFieldSchema>;

export const LockedStructuredReviewFieldSchema = z.enum([
  "sku",
  "price",
  "stock",
  "variants",
  "shopeeProductId",
  "promoEligibility"
]);
export type LockedStructuredReviewField = z.infer<typeof LockedStructuredReviewFieldSchema>;

export const ReviewOptionSchema = z
  .object({
    optionId: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
    intent: z.enum(["approve_as_is", "request_edit", "request_more_options", "reject"])
  })
  .strict();
export type ReviewOption = z.infer<typeof ReviewOptionSchema>;

export const SellerFreeFormReviewResponseSchema = z
  .object({
    responseId: z.string().min(1),
    roundId: z.string().min(1),
    productId: z.string().min(1),
    text: z.string().min(1),
    receivedAt: z.string().datetime(),
    selectedOptionId: z.string().min(1).optional(),
    interpretedIntent: z.enum(["approve", "reject", "edit_request", "more_options", "unknown"]),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict();
export type SellerFreeFormReviewResponse = z.infer<typeof SellerFreeFormReviewResponseSchema>;

export const SellerReviewRoundSchema = z
  .object({
    roundId: z.string().min(1),
    productId: z.string().min(1),
    proposedAt: z.string().datetime(),
    prompt: z.string().min(1),
    options: z.array(ReviewOptionSchema).min(2),
    freeFormResponseMode: z.literal("enabled"),
    response: SellerFreeFormReviewResponseSchema.optional()
  })
  .strict()
  .superRefine((round, ctx) => {
    if (round.response?.productId && round.response.productId !== round.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["response", "productId"],
        message: "Review response productId must match review round productId"
      });
    }
    if (round.response?.roundId && round.response.roundId !== round.roundId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["response", "roundId"],
        message: "Review response roundId must match review round roundId"
      });
    }
    if (
      round.response?.selectedOptionId &&
      !round.options.some((option) => option.optionId === round.response?.selectedOptionId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["response", "selectedOptionId"],
        message: "Selected option must exist in the review round options"
      });
    }
  });
export type SellerReviewRound = z.infer<typeof SellerReviewRoundSchema>;

export const PrepGenerationTaskSchema = z
  .object({
    taskId: z.string().min(1),
    productId: z.string().min(1),
    taskType: z.enum(["identity_draft", "seller_guidance", "photo_prompt", "image_edit"]),
    status: z.enum(["pending", "running", "completed", "failed"]),
    inputRefs: z.array(z.string().min(1)),
    outputRefs: z.array(z.string().min(1)),
    dependsOnTaskIds: z.array(z.string().min(1)),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    error: z.string().min(1).optional(),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict()
  .superRefine((task, ctx) => {
    if (task.status === "completed" && task.outputRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputRefs"],
        message: "Completed prep generation tasks must include outputRefs"
      });
    }
    if (task.status === "failed" && !task.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed prep generation tasks must include error"
      });
    }
  });
export type PrepGenerationTask = z.infer<typeof PrepGenerationTaskSchema>;

const SellerGuidancePatchSchema = SellerGuidanceSchema.omit({ productId: true }).partial().strict();

export const AiDraftUpdateSchema = z
  .object({
    updateId: z.string().min(1),
    productId: z.string().min(1),
    actor: z.literal("ai"),
    updatedAt: z.string().datetime(),
    reason: z.string().min(1),
    patch: z
      .object({
        title: z.string().min(1).optional(),
        aliases: z.array(z.string().min(1)).optional(),
        category: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        listingDraft: ProductListingDraftSchema.optional(),
        sellerGuidance: SellerGuidancePatchSchema.optional(),
        photoEnhancementPrompts: z.array(z.string().min(1)).optional()
      })
      .strict()
      .refine((patch) => Object.keys(patch).length > 0, {
        message: "AI draft update patch must include at least one draftable field"
      }),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict();
export type AiDraftUpdate = z.infer<typeof AiDraftUpdateSchema>;

export const ProductReviewDecisionSchema = z
  .object({
    decisionId: z.string().min(1),
    productId: z.string().min(1),
    status: z.enum(["pending", "approved", "rejected", "edited"]),
    decidedBy: z.enum(["seller"]).optional(),
    decidedAt: z.string().datetime().optional(),
    reason: z.string().min(1),
    editedProduct: ProductRecordSchema.optional(),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict()
  .superRefine((decision, ctx) => {
    if (decision.status === "pending") {
      if (decision.decidedBy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["decidedBy"],
          message: "Pending review decisions must not include decidedBy"
        });
      }
      if (decision.decidedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["decidedAt"],
          message: "Pending review decisions must not include decidedAt"
        });
      }
      if (decision.editedProduct) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["editedProduct"],
          message: "Pending review decisions must not include editedProduct"
        });
      }
      return;
    }

    if (!decision.decidedBy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decidedBy"],
        message: "Final review decisions must include decidedBy"
      });
    }
    if (!decision.decidedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decidedAt"],
        message: "Final review decisions must include decidedAt"
      });
    }
    if (decision.status === "edited" && !decision.editedProduct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editedProduct"],
        message: "Edited review decisions must include editedProduct"
      });
    }
    if (decision.status !== "edited" && decision.editedProduct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editedProduct"],
        message: "Only edited review decisions may include editedProduct"
      });
    }
    if (decision.editedProduct && decision.editedProduct.id !== decision.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["editedProduct", "id"],
        message: "Edited product id must match the review decision productId"
      });
    }
  });
export type ProductReviewDecision = z.infer<typeof ProductReviewDecisionSchema>;

export const ProductReviewItemSchema = z
  .object({
    productId: z.string().min(1),
    product: ProductRecordSchema,
    identityDraft: ProductIdentityDraftSchema,
    sellerGuidance: SellerGuidanceSchema,
    photoEnhancementPlan: ImageGenerationPlanSchema,
    aiUpdatableFields: z.array(AiUpdatableReviewFieldSchema).min(1),
    lockedStructuredFields: z.array(LockedStructuredReviewFieldSchema).min(1),
    draftUpdates: z.array(AiDraftUpdateSchema),
    reviewRounds: z.array(SellerReviewRoundSchema).min(1),
    decision: ProductReviewDecisionSchema
  })
  .strict()
  .superRefine((item, ctx) => {
    const productScopedFields = [
      ["product", item.product.id],
      ["identityDraft", item.identityDraft.productId],
      ["sellerGuidance", item.sellerGuidance.productId],
      ["photoEnhancementPlan", item.photoEnhancementPlan.productId],
      ["decision", item.decision.productId]
    ] as const;

    for (const [field, productId] of productScopedFields) {
      if (productId !== item.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field, "productId"],
          message: "Product review item productId fields must match"
        });
      }
    }

    item.draftUpdates.forEach((update, index) => {
      if (update.productId !== item.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["draftUpdates", index, "productId"],
          message: "AI draft update productId must match the review item"
        });
      }
    });

    item.reviewRounds.forEach((round, index) => {
      if (round.productId !== item.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reviewRounds", index, "productId"],
          message: "Review round productId must match the review item"
        });
      }
    });
  });
export type ProductReviewItem = z.infer<typeof ProductReviewItemSchema>;

export const ProductReviewPlanSchema = z
  .object({
    reviewPlanId: z.string().min(1),
    sessionId: z.string().min(1),
    generatedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum([
      "seller_review_required",
      "ready_for_publish",
      "partially_approved",
      "rejected"
    ]),
    items: z.array(ProductReviewItemSchema).min(1),
    generationTasks: z.array(PrepGenerationTaskSchema),
    sellerUiPolicy: SellerUiPolicySchema,
    citations: z.array(EvidenceCitationSchema)
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (plan.sellerUiPolicy.sessionId !== plan.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sellerUiPolicy", "sessionId"],
        message: "Seller UI policy sessionId must match review plan sessionId"
      });
    }

    const productIds = new Set<string>();
    plan.items.forEach((item, index) => {
      if (productIds.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "productId"],
          message: "Product review plan productIds must be unique"
        });
      }
      productIds.add(item.productId);
    });
  });
export type ProductReviewPlan = z.infer<typeof ProductReviewPlanSchema>;

export const ShopeeCreateProductCommandSchema = z
  .object({
    commandId: z.string().min(1),
    sessionId: z.string().min(1),
    productId: z.string().min(1),
    kind: z.literal("create_product"),
    createdAt: z.string().datetime(),
    approvalDecisionId: z.string().min(1),
    approvalStatus: z.enum(["approved", "edited"]),
    payload: z
      .object({
        product: ProductRecordSchema
      })
      .strict(),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict()
  .superRefine((command, ctx) => {
    if (command.payload.product.id !== command.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "product", "id"],
        message: "Create-product command payload product id must match productId"
      });
    }
  });
export type ShopeeCreateProductCommand = z.infer<typeof ShopeeCreateProductCommandSchema>;

export const ShopeeStartLivestreamCommandSchema = z
  .object({
    commandId: z.string().min(1),
    sessionId: z.string().min(1),
    kind: z.literal("prepare_livestream"),
    createdAt: z.string().datetime(),
    approvalId: z.string().min(1),
    approvalStatus: z.literal("approved"),
    safetyMode: z.literal("create_session_capture_credentials"),
    payload: z
      .object({
        title: z.string().min(1),
        productIds: z.array(z.string().min(1)).min(1),
        publicOverlayUrl: z.string().min(1),
        shopeeSetupSteps: z.array(
          z.enum([
            "open_live_center",
            "create_live_session",
            "capture_stream_credentials",
            "bind_public_overlay_preview"
          ])
        ).min(1),
        streamCredentialHandling: z.literal("transient_capture_redacted_evidence"),
        credentialEvidence: z.literal("redacted_presence_only"),
        cameraPreviewRequired: z.boolean(),
        goLive: z.literal(false)
      })
      .strict(),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict();
export type ShopeeStartLivestreamCommand = z.infer<typeof ShopeeStartLivestreamCommandSchema>;

export const LiveSessionSpecSchema = z
  .object({
    sessionId: z.string().min(1),
    shopId: z.string().min(1),
    title: z.string().min(1),
    targetLanguages: z.array(LanguageCodeSchema).min(1),
    products: z.array(ProductRecordSchema).min(1),
    promos: z.array(PromoRecordSchema),
    policyPack: PolicyPackSchema,
    retrievalRefs: z.array(
      z
        .object({
          refId: z.string().min(1),
          sourceId: z.string().min(1),
          productIds: z.array(z.string().min(1)),
          policyIds: z.array(z.string().min(1)),
          languages: z.array(LanguageCodeSchema)
        })
        .strict()
    ),
    approvalMode: z.enum(["manual", "hybrid", "auto_low_risk_only"]),
    enabledTools: z.array(
      z.enum([
        "draft_reply",
        "send_reply",
        "show_product_card",
        "show_promo_banner",
        "update_caption",
        "emit_translation",
        "escalate",
        "request_approval",
        "record_memory"
      ])
    )
  })
  .strict();
export type LiveSessionSpec = z.infer<typeof LiveSessionSpecSchema>;

const RuntimeEventBaseSchema = z
  .object({
    eventId: z.string().min(1),
    sessionId: z.string().min(1),
    timestamp: z.string().datetime(),
    source: z.enum(["viewer", "host", "extension", "overlay", "runtime", "seller"])
  })
  .strict();

export const ViewerChatEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal("viewer_chat"),
  payload: z
    .object({
      viewerId: z.string().min(1),
      viewerName: z.string().min(1),
      text: z.string().min(1),
      language: LanguageCodeSchema.optional()
    })
    .strict()
});

export const HostTranscriptEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal("host_transcript"),
  payload: z
    .object({
      text: z.string().min(1),
      language: LanguageCodeSchema,
      confidence: z.number().min(0).max(1)
    })
    .strict()
});

export const HostAudioChunkEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal("host_audio_chunk"),
  payload: z
    .object({
      audioRef: z.string().min(1),
      durationMs: z.number().int().positive(),
      format: z.enum(["pcm16", "opus", "wav"])
    })
    .strict()
});

export const ProductSwitchEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal("product_switch"),
  payload: z
    .object({
      productId: z.string().min(1)
    })
    .strict()
});

export const PromoUpdateEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal("promo_update"),
  payload: z
    .object({
      promoId: z.string().min(1),
      remainingQuantity: z.number().int().nonnegative()
    })
    .strict()
});

export const MetricUpdateEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal("metric_update"),
  payload: z
    .object({
      viewerCount: z.number().int().nonnegative(),
      likes: z.number().int().nonnegative(),
      orders: z.number().int().nonnegative()
    })
    .strict()
});

export const ToolResultSchema = z
  .object({
    actionId: z.string().min(1),
    adapter: z.enum([
      "extension",
      "overlay",
      "fake-extension",
      "fake-overlay",
      "shopee-content-script",
      "runtime"
    ]),
    status: z.enum(["pending", "applied", "skipped", "failed", "rejected"]),
    evidence: z.array(EvidenceCitationSchema),
    error: z.string().min(1).optional(),
    timestamp: z.string().datetime()
  })
  .strict();
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ToolResultEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal("tool_result"),
  payload: ToolResultSchema
});

export const StreamLifecycleEventSchema = RuntimeEventBaseSchema.extend({
  type: z.literal("stream_lifecycle"),
  payload: z
    .object({
      status: z.enum(["started", "closed"]),
      reason: z.string().min(1).optional()
    })
    .strict()
});

export const RuntimeEventSchema = z.discriminatedUnion("type", [
  ViewerChatEventSchema,
  HostTranscriptEventSchema,
  HostAudioChunkEventSchema,
  ProductSwitchEventSchema,
  PromoUpdateEventSchema,
  MetricUpdateEventSchema,
  ToolResultEventSchema,
  StreamLifecycleEventSchema
]);
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export const StreamMomentSchema = z
  .object({
    momentId: z.string().min(1),
    sessionId: z.string().min(1),
    eventId: z.string().min(1),
    timestamp: z.string().datetime(),
    kind: z.enum([
      "viewer_question",
      "host_caption",
      "product_switch",
      "promo_update",
      "approval_required",
      "risk_escalation",
      "performance_signal",
      "lifecycle"
    ]),
    title: z.string().min(1),
    detail: z.string().min(1),
    productId: z.string().min(1).optional(),
    promoId: z.string().min(1).optional(),
    risk: RiskLevelSchema.optional(),
    actionIds: z.array(z.string().min(1)),
    auditIds: z.array(z.string().min(1)),
    citations: z.array(EvidenceCitationSchema)
  })
  .strict();
export type StreamMoment = z.infer<typeof StreamMomentSchema>;

export const RollingStreamSummarySchema = z
  .object({
    summaryId: z.string().min(1),
    sessionId: z.string().min(1),
    status: z.enum(["active", "closed"]),
    checkpointSeq: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    eventCount: z.number().int().nonnegative(),
    auditEventCount: z.number().int().nonnegative(),
    actionCount: z.number().int().nonnegative(),
    publicReplies: z.number().int().nonnegative(),
    drafts: z.number().int().nonnegative(),
    escalations: z.number().int().nonnegative(),
    approvalsRequested: z.number().int().nonnegative(),
    orders: z.number().int().nonnegative(),
    viewerPeak: z.number().int().nonnegative(),
    currentProductId: z.string().min(1).optional(),
    currentPromoId: z.string().min(1).optional(),
    topQuestions: z.array(z.string().min(1)),
    moments: z.array(StreamMomentSchema),
    recommendations: z.array(z.string().min(1)),
    finalizedAt: z.string().datetime().optional()
  })
  .strict();
export type RollingStreamSummary = z.infer<typeof RollingStreamSummarySchema>;

export const ViewerMemorySchema = z
  .object({
    viewerId: z.string().min(1),
    displayName: z.string().min(1).optional(),
    preferredLanguage: LanguageCodeSchema.optional(),
    knownQuestions: z.array(z.string().min(1)),
    productAffinity: z.record(z.string().min(1), z.number().nonnegative()),
    riskFlags: z.array(z.string().min(1)),
    lastSeenAt: z.string().datetime()
  })
  .strict();
export type ViewerMemory = z.infer<typeof ViewerMemorySchema>;

export const SessionMemorySchema = z
  .object({
    sessionId: z.string().min(1),
    topQuestions: z.array(z.string().min(1)),
    languageCounts: z.record(z.string().min(1), z.number().int().nonnegative()),
    productInterest: z.record(z.string().min(1), z.number().int().nonnegative()),
    escalations: z.array(z.string().min(1)),
    recommendations: z.array(z.string().min(1)),
    updatedAt: z.string().datetime()
  })
  .strict();
export type SessionMemory = z.infer<typeof SessionMemorySchema>;

export const ContextEnvelopeSchema = z
  .object({
    contextId: z.string().min(1),
    event: RuntimeEventSchema,
    session: LiveSessionSpecSchema,
    currentProductId: z.string().min(1).optional(),
    currentPromoId: z.string().min(1).optional(),
    viewerMemory: ViewerMemorySchema.optional(),
    sessionMemory: SessionMemorySchema,
    retrievalCitations: z.array(EvidenceCitationSchema),
    structuredFacts: z
      .object({
        productIds: z.array(z.string().min(1)),
        promoIds: z.array(z.string().min(1)),
        canonicalFields: z.array(
          z.enum([
            "price",
            "stock",
            "variants",
            "sku",
            "shopeeProductId",
            "promoEligibility"
          ])
        )
      })
      .strict(),
    policyFlags: z.array(
      z
        .object({
          rule: z.string().min(1),
          risk: RiskLevelSchema,
          reason: z.string().min(1)
        })
        .strict()
    )
  })
  .strict();
export type ContextEnvelope = z.infer<typeof ContextEnvelopeSchema>;

export const LiveActionTypeSchema = z.enum([
  "send_reply",
  "draft_reply",
  "escalate",
  "request_approval",
  "show_product_card",
  "show_promo_banner",
  "update_caption",
  "emit_translation",
  "set_caption_visibility",
  "set_audio_mix",
  "set_current_product",
  "record_memory"
]);
export type LiveActionType = z.infer<typeof LiveActionTypeSchema>;

const ReplyPayloadSchema = z
  .object({
    kind: z.enum(["send_reply", "draft_reply"]),
    viewerId: z.string().min(1),
    text: z.string().min(1),
    language: LanguageCodeSchema,
    productId: z.string().min(1).optional(),
    promoId: z.string().min(1).optional()
  })
  .strict();

const EscalatePayloadSchema = z
  .object({
    kind: z.literal("escalate"),
    severity: z.enum(["medium", "high", "blocked"]),
    sellerMessage: z.string().min(1),
    suggestedScript: z.string().min(1)
  })
  .strict();

const ApprovalPayloadSchema = z
  .object({
    kind: z.literal("request_approval"),
    prompt: z.string().min(1),
    proposedPublicText: z.string().min(1).optional(),
    expiresAt: z.string().datetime()
  })
  .strict();

const ProductCardPayloadSchema = z
  .object({
    kind: z.literal("show_product_card"),
    productId: z.string().min(1)
  })
  .strict();

const PromoBannerPayloadSchema = z
  .object({
    kind: z.literal("show_promo_banner"),
    promoId: z.string().min(1),
    backing: z.enum(["shopee", "overlay_only"])
  })
  .strict();

const CaptionPayloadSchema = z
  .object({
    kind: z.literal("update_caption"),
    text: z.string().min(1),
    language: LanguageCodeSchema,
    visible: z.boolean()
  })
  .strict();

const TranslationPayloadSchema = z
  .object({
    kind: z.literal("emit_translation"),
    sourceLanguage: LanguageCodeSchema,
    targetLanguage: LanguageCodeSchema,
    text: z.string().min(1)
  })
  .strict();

const CaptionVisibilityPayloadSchema = z
  .object({
    kind: z.literal("set_caption_visibility"),
    visible: z.boolean()
  })
  .strict();

const AudioMixPayloadSchema = z
  .object({
    kind: z.literal("set_audio_mix"),
    sourceVolume: z.number().min(0).max(1),
    translatedVolume: z.number().min(0).max(1)
  })
  .strict();

const CurrentProductPayloadSchema = z
  .object({
    kind: z.literal("set_current_product"),
    productId: z.string().min(1)
  })
  .strict();

const RecordMemoryPayloadSchema = z
  .object({
    kind: z.literal("record_memory"),
    viewerId: z.string().min(1).optional(),
    note: z.string().min(1),
    productId: z.string().min(1).optional()
  })
  .strict();

export const LiveActionPayloadSchema = z.discriminatedUnion("kind", [
  ReplyPayloadSchema.extend({ kind: z.literal("send_reply") }),
  ReplyPayloadSchema.extend({ kind: z.literal("draft_reply") }),
  EscalatePayloadSchema,
  ApprovalPayloadSchema,
  ProductCardPayloadSchema,
  PromoBannerPayloadSchema,
  CaptionPayloadSchema,
  TranslationPayloadSchema,
  CaptionVisibilityPayloadSchema,
  AudioMixPayloadSchema,
  CurrentProductPayloadSchema,
  RecordMemoryPayloadSchema
]);

export const LiveActionSchema = z
  .object({
    actionId: z.string().min(1),
    sessionId: z.string().min(1),
    createdAt: z.string().datetime(),
    type: LiveActionTypeSchema,
    risk: RiskLevelSchema,
    reason: z.string().min(1),
    citations: z.array(EvidenceCitationSchema),
    requiresApproval: z.boolean(),
    approvalId: z.string().min(1).optional(),
    payload: LiveActionPayloadSchema
  })
  .strict()
  .superRefine((action, ctx) => {
    if (action.type !== action.payload.kind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "kind"],
        message: "LiveAction type must match payload.kind"
      });
    }
    if (action.type === "send_reply" && (action.requiresApproval || action.risk !== "low")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["risk"],
        message: "send_reply must be low-risk and not require approval"
      });
    }
  });
export type LiveAction = z.infer<typeof LiveActionSchema>;

export const ApprovalRequestSchema = z
  .object({
    approvalId: z.string().min(1),
    actionId: z.string().min(1),
    sessionId: z.string().min(1),
    status: z.enum(["pending", "approved", "rejected", "edited", "expired"]),
    originalAction: LiveActionSchema,
    editedPayload: LiveActionPayloadSchema.optional(),
    requestedAt: z.string().datetime(),
    decidedAt: z.string().datetime().optional(),
    reason: z.string().min(1),
    expiresAt: z.string().datetime()
  })
  .strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const AuditEventSchema = z
  .object({
    auditId: z.string().min(1),
    sessionId: z.string().min(1),
    timestamp: z.string().datetime(),
    kind: z.enum([
      "input",
      "context",
      "policy",
      "model_action",
      "approval",
      "tool_result",
      "post_stream_summary"
    ]),
    actor: z.enum(["viewer", "host", "seller", "runtime", "extension", "overlay"]),
    reason: z.string().min(1),
    event: RuntimeEventSchema.optional(),
    context: ContextEnvelopeSchema.optional(),
    action: LiveActionSchema.optional(),
    approval: ApprovalRequestSchema.optional(),
    toolResult: ToolResultSchema.optional()
  })
  .strict();
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const OverlayStateSchema = z
  .object({
    sessionId: z.string().min(1),
    currentProductId: z.string().min(1).optional(),
    caption: z
      .object({
        text: z.string(),
        language: LanguageCodeSchema,
        visible: z.boolean()
      })
      .strict(),
    translatedCaptions: z.array(
      z
        .object({
          language: LanguageCodeSchema,
          text: z.string().min(1)
        })
        .strict()
    ),
    productCard: z
      .object({
        productId: z.string().min(1),
        title: z.string().min(1),
        price: z.number().nonnegative(),
        currency: CurrencySchema,
        stock: z.number().int().nonnegative(),
        imageUri: z.string().min(1)
      })
      .strict()
      .optional(),
    promoBanner: z
      .object({
        promoId: z.string().min(1),
        title: z.string().min(1),
        remainingQuantity: z.number().int().nonnegative(),
        endsAt: z.string().datetime(),
        backing: z.enum(["shopee", "overlay_only"])
      })
      .strict()
      .optional(),
    audioMix: z
      .object({
        sourceVolume: z.number().min(0).max(1),
        translatedVolume: z.number().min(0).max(1)
      })
      .strict(),
    background: z
      .object({
        mode: z.enum(["default", "solid", "image"]),
        value: z.string().min(1),
        label: z.string().min(1)
      })
      .strict()
      .optional(),
    layoutWarnings: z.array(z.string().min(1)),
    updatedAt: z.string().datetime()
  })
  .strict();
export type OverlayState = z.infer<typeof OverlayStateSchema>;
