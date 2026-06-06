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
    listingDraft: z
      .object({
        title: z.string().min(1),
        description: z.string().min(1),
        bulletPoints: z.array(z.string().min(1))
      })
      .strict()
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

export const RuntimeEventSchema = z.discriminatedUnion("type", [
  ViewerChatEventSchema,
  HostTranscriptEventSchema,
  HostAudioChunkEventSchema,
  ProductSwitchEventSchema,
  PromoUpdateEventSchema,
  MetricUpdateEventSchema,
  ToolResultEventSchema
]);
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

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
    layoutWarnings: z.array(z.string().min(1)),
    updatedAt: z.string().datetime()
  })
  .strict();
export type OverlayState = z.infer<typeof OverlayStateSchema>;
