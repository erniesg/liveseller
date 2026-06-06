import type {
  AiDraftUpdate,
  AuditEvent,
  EvidenceCitation,
  ImageGenerationPlan,
  LiveAction,
  LiveSessionSpec,
  OverlayState,
  PolicyPack,
  PrepGenerationTask,
  ProductReviewPlan,
  ProductRecord,
  PromoRecord,
  RuntimeEvent,
  SessionMemory,
  SellerFreeFormReviewResponse,
  SellerGuidance,
  SellerReviewRound,
  SellerTimelineEvent,
  SellerUiPolicy,
  ShopeeCreateProductCommand,
  ShopeeStartLivestreamCommand,
  ViewerMemory
} from "./schemas";

const now = "2026-06-06T02:00:00.000Z";

export const seedCitation = {
  sourceId: "seed-folder",
  sourceType: "upload" as const,
  locator: "apps/prep/seed/product-notes.md",
  excerpt: "Seed catalog supplied for hackathon checkpoint.",
  confidence: 0.92
};

export const validProducts: ProductRecord[] = [
  {
    id: "prod-cooling-tee",
    sku: "LS-TEE-001",
    title: "Bamboo Cooling Tee",
    aliases: ["cooling tee", "bamboo shirt", "透气T恤"],
    category: "Apparel",
    description: "Soft bamboo-blend tee designed for humid weather and daily wear.",
    price: 19.9,
    currency: "SGD",
    variants: [
      {
        id: "tee-black-m",
        name: "Black / M",
        sku: "LS-TEE-001-BLK-M",
        priceDelta: 0,
        stock: 18,
        attributes: { color: "Black", size: "M" }
      },
      {
        id: "tee-white-l",
        name: "White / L",
        sku: "LS-TEE-001-WHT-L",
        priceDelta: 0,
        stock: 24,
        attributes: { color: "White", size: "L" }
      }
    ],
    stock: 42,
    dimensions: { weightGrams: 180, lengthCm: 28, widthCm: 22, heightCm: 2 },
    shipping: {
      originCountry: "SG",
      shipWithinDays: 2,
      supportedMethods: ["Shopee Standard", "NinjaVan"],
      freeShipping: false
    },
    returnPolicy: {
      windowDays: 7,
      conditions: ["Unused", "Original packaging"],
      exclusions: ["Washed items", "Wear-and-tear"]
    },
    media: {
      images: [
        {
          id: "tee-main",
          uri: "/assets/products/cooling-tee.svg",
          alt: "Bamboo Cooling Tee in black and white",
          citations: [seedCitation]
        }
      ],
      videos: []
    },
    evidence: [seedCitation],
    sourceConfidence: 0.94,
    listingDraft: {
      title: "Bamboo Cooling Tee for Humid Weather",
      description:
        "Stay comfortable during live events, errands, and travel with a breathable bamboo-blend tee.",
      bulletPoints: ["Breathable bamboo blend", "Soft everyday fit", "Ships from Singapore"]
    }
  },
  {
    id: "prod-cable-pouch",
    sku: "LS-BAG-002",
    title: "Travel Cable Pouch",
    aliases: ["cable organizer", "travel pouch", "收纳包"],
    category: "Bags & Travel",
    description: "Compact organizer for charging cables, adapters, cards, and earbuds.",
    price: 14.5,
    currency: "SGD",
    variants: [
      {
        id: "pouch-sage",
        name: "Sage",
        sku: "LS-BAG-002-SAGE",
        priceDelta: 0,
        stock: 16,
        attributes: { color: "Sage" }
      },
      {
        id: "pouch-charcoal",
        name: "Charcoal",
        sku: "LS-BAG-002-CHAR",
        priceDelta: 0,
        stock: 14,
        attributes: { color: "Charcoal" }
      }
    ],
    stock: 30,
    dimensions: { weightGrams: 120, lengthCm: 20, widthCm: 12, heightCm: 5 },
    shipping: {
      originCountry: "SG",
      shipWithinDays: 2,
      supportedMethods: ["Shopee Standard", "J&T Express"],
      freeShipping: false
    },
    returnPolicy: {
      windowDays: 7,
      conditions: ["Unused", "No stains"],
      exclusions: ["Damage from misuse"]
    },
    media: {
      images: [
        {
          id: "pouch-main",
          uri: "/assets/products/cable-pouch.svg",
          alt: "Travel Cable Pouch with cables packed inside",
          citations: [seedCitation]
        }
      ],
      videos: []
    },
    evidence: [seedCitation],
    sourceConfidence: 0.91,
    listingDraft: {
      title: "Travel Cable Pouch Organizer",
      description:
        "Keep chargers, cables, and everyday tech accessories sorted in a compact pouch.",
      bulletPoints: ["Compact travel layout", "Two color options", "Good for office and trips"]
    }
  },
  {
    id: "prod-insulated-tumbler",
    sku: "LS-BOTTLE-003",
    title: "Insulated Tumbler 500ml",
    aliases: ["tumbler", "water bottle", "保温杯"],
    category: "Home & Living",
    description: "Double-wall tumbler for hot coffee or cold drinks during long streams.",
    price: 24,
    currency: "SGD",
    variants: [
      {
        id: "tumbler-cream",
        name: "Cream",
        sku: "LS-BOTTLE-003-CRM",
        priceDelta: 0,
        stock: 8,
        attributes: { color: "Cream", capacity: "500ml" }
      },
      {
        id: "tumbler-steel",
        name: "Steel",
        sku: "LS-BOTTLE-003-STL",
        priceDelta: 2,
        stock: 10,
        attributes: { color: "Steel", capacity: "500ml" }
      }
    ],
    stock: 18,
    dimensions: { weightGrams: 310, lengthCm: 8, widthCm: 8, heightCm: 23 },
    shipping: {
      originCountry: "SG",
      shipWithinDays: 3,
      supportedMethods: ["Shopee Standard"],
      freeShipping: false
    },
    returnPolicy: {
      windowDays: 7,
      conditions: ["Unused", "Seal intact"],
      exclusions: ["Hygiene seal removed"]
    },
    media: {
      images: [
        {
          id: "tumbler-main",
          uri: "/assets/products/tumbler.svg",
          alt: "Insulated Tumbler in cream and steel",
          citations: [seedCitation]
        }
      ],
      videos: []
    },
    evidence: [seedCitation],
    sourceConfidence: 0.9,
    listingDraft: {
      title: "500ml Insulated Tumbler",
      description:
        "A durable tumbler for coffee, tea, or iced drinks while working, commuting, or streaming.",
      bulletPoints: ["Double-wall insulation", "500ml capacity", "Two finish options"]
    }
  }
];

export const validPromo: PromoRecord = {
  id: "promo-flash-10",
  type: "percentage",
  title: "Live Flash 10% Off",
  discount: { value: 10, percent: 10 },
  minSpend: 20,
  eligibleProductIds: validProducts.map((product) => product.id),
  startAt: "2026-06-06T02:00:00.000Z",
  endAt: "2026-06-06T04:00:00.000Z",
  remainingQuantity: 50,
  source: "seller_note",
  riskNotes: ["Overlay-only until verified in Shopee Seller Centre."],
  citations: [seedCitation]
};

export const validPolicyPack: PolicyPack = {
  id: "policy-sg-live-v1",
  market: "SG",
  languages: ["en", "zh", "ms", "ta"],
  safeFaq: [
    {
      id: "faq-shipping-sg",
      question: "How long is shipping?",
      answer: "Orders ship from Singapore within 2-3 working days.",
      language: "en" as const,
      citations: [seedCitation]
    },
    {
      id: "faq-return",
      question: "Can I return it?",
      answer:
        "Eligible unused items can be returned within 7 days according to the shop policy.",
      language: "en" as const,
      citations: [seedCitation]
    }
  ],
  shippingPolicy: "Most items ship from Singapore within 2-3 working days.",
  returnPolicy:
    "Unused items in original condition may be returned within 7 days; hygiene exclusions apply.",
  restrictedClaims: [
    "medical cure",
    "guaranteed income",
    "official Shopee discount unless verified"
  ],
  escalationTriggers: [
    "refund commitment",
    "fake or counterfeit accusation",
    "legal threat",
    "fraud allegation",
    "unauthorized discount"
  ],
  citations: [seedCitation]
};

export const validLiveSessionSpec: LiveSessionSpec = {
  sessionId: "live-seed-001",
  shopId: "shop-sg-demo",
  title: "LiveSeller Multilingual Demo",
  targetLanguages: ["en", "zh", "ms", "ta"],
  products: validProducts,
  promos: [validPromo],
  policyPack: validPolicyPack,
  retrievalRefs: [
    {
      refId: "retrieval-seed-policy",
      sourceId: "seed-folder",
      productIds: validProducts.map((product) => product.id),
      policyIds: [validPolicyPack.id],
      languages: ["en", "zh", "ms", "ta"]
    }
  ],
  approvalMode: "hybrid",
  enabledTools: [
    "draft_reply",
    "send_reply",
    "show_product_card",
    "show_promo_banner",
    "update_caption",
    "emit_translation",
    "escalate",
    "request_approval",
    "record_memory"
  ]
};

export const validViewerMemory: ViewerMemory = {
  viewerId: "viewer-001",
  displayName: "Alicia",
  preferredLanguage: "en",
  knownQuestions: ["price for bamboo cooling tee"],
  productAffinity: { "prod-cooling-tee": 2 },
  riskFlags: [],
  lastSeenAt: now
};

export const validSessionMemory: SessionMemory = {
  sessionId: validLiveSessionSpec.sessionId,
  topQuestions: ["shipping time", "tumbler stock"],
  languageCounts: { en: 4, zh: 2, ms: 1, ta: 1 },
  productInterest: {
    "prod-cooling-tee": 5,
    "prod-cable-pouch": 3,
    "prod-insulated-tumbler": 2
  },
  escalations: [],
  recommendations: ["Show the cable pouch after the tee because viewers asked about travel use."],
  updatedAt: now
};

const reviewAiUpdatableFields = [
  "title",
  "aliases",
  "category",
  "description",
  "listingDraft",
  "sellerGuidance",
  "photoEnhancementPrompts"
] as const;

const reviewLockedStructuredFields = [
  "sku",
  "price",
  "stock",
  "variants",
  "shopeeProductId",
  "promoEligibility"
] as const;

function validReviewGuidance(product: ProductRecord): SellerGuidance {
  return {
    productId: product.id,
    talkTrack: `Show ${product.title} and keep price, stock, SKU, and variants tied to structured records.`,
    researchNotes: [
      `Structured category: ${product.category}.`,
      "AI can polish wording, but cannot change price, stock, SKU, variants, Shopee IDs, or promo eligibility."
    ],
    likelyBuyerQuestions: ["How much is it?", "How many are left?", "Which variants are available?"],
    riskNotes: ["Seller approval is required before creating a Shopee product listing."]
  };
}

function validImageGenerationPlan(product: ProductRecord): ImageGenerationPlan {
  return {
    productId: product.id,
    model: "gpt-image-2",
    sourceImageUris: product.media.images.map((image) => image.uri),
    prompts: [
      `Create a square Shopee cover for ${product.title} using supplied product images only.`,
      `Create a livestream product card crop for ${product.title} without inventing variants.`,
      `Create a clean catalog alternate for ${product.title} while preserving visible condition.`
    ]
  };
}

function validReviewRound(product: ProductRecord): SellerReviewRound {
  return {
    roundId: `round-${product.id}-001`,
    productId: product.id,
    proposedAt: now,
    prompt:
      "Review the drafted Shopee listing. Choose an option or reply freely with edits, rejection reasons, or requests for more options.",
    options: [
      {
        optionId: `option-${product.id}-approve`,
        label: "Approve draft",
        description: "Use the structured product facts and current listing draft as-is.",
        intent: "approve_as_is"
      },
      {
        optionId: `option-${product.id}-edit`,
        label: "Request edits",
        description: "Reply with free-form wording, image, or policy edits before publishing.",
        intent: "request_edit"
      },
      {
        optionId: `option-${product.id}-more-options`,
        label: "More options",
        description: "Ask the agent to propose another set of listing or image directions.",
        intent: "request_more_options"
      }
    ],
    freeFormResponseMode: "enabled"
  };
}

function validGenerationTasks(product: ProductRecord): PrepGenerationTask[] {
  const completedTaskBase = {
    productId: product.id,
    status: "completed" as const,
    outputRefs: [`review://${product.id}`],
    dependsOnTaskIds: [],
    startedAt: now,
    completedAt: now,
    citations: product.evidence
  };

  return [
    {
      ...completedTaskBase,
      taskId: `task-${product.id}-identity-draft`,
      taskType: "identity_draft",
      inputRefs: product.evidence.map((citation) => citation.locator)
    },
    {
      ...completedTaskBase,
      taskId: `task-${product.id}-seller-guidance`,
      taskType: "seller_guidance",
      inputRefs: [product.id]
    },
    {
      ...completedTaskBase,
      taskId: `task-${product.id}-photo-prompt`,
      taskType: "photo_prompt",
      inputRefs: product.media.images.map((image) => image.uri)
    },
    ...product.media.images.map((image) => ({
      taskId: `task-${product.id}-image-edit-${image.id}`,
      productId: product.id,
      taskType: "image_edit" as const,
      status: "pending" as const,
      inputRefs: [image.uri],
      outputRefs: [],
      dependsOnTaskIds: [`task-${product.id}-photo-prompt`],
      citations: image.citations
    }))
  ];
}

export const validAiDraftUpdate: AiDraftUpdate = {
  updateId: "ai-update-prod-cooling-tee-001",
  productId: validProducts[0]!.id,
  actor: "ai",
  updatedAt: "2026-06-06T02:05:00.000Z",
  reason: "Polish listing copy while preserving structured price, stock, SKU, and variants.",
  patch: {
    title: "Bamboo Cooling Tee - Seller Review Draft",
    listingDraft: {
      title: "Bamboo Cooling Tee - Seller Review Draft",
      description: "Breathable bamboo-blend tee copy prepared for seller review.",
      bulletPoints: ["Breathable bamboo blend", "Structured stock unchanged", "Seller approval required"]
    },
    sellerGuidance: {
      talkTrack: "Show fabric drape and sizing, then quote only structured price and stock.",
      riskNotes: ["Do not claim medical cooling benefits."]
    },
    photoEnhancementPrompts: [
      "Create a square Shopee cover that preserves the exact tee shape, color, and variants."
    ]
  },
  citations: [seedCitation]
};

export const validSellerFreeFormReviewResponse: SellerFreeFormReviewResponse = {
  responseId: "response-prod-cooling-tee-001",
  roundId: `round-${validProducts[0]!.id}-001`,
  productId: validProducts[0]!.id,
  text: "Please make the title shorter, then show me another image prompt option.",
  receivedAt: "2026-06-06T02:12:00.000Z",
  selectedOptionId: `option-${validProducts[0]!.id}-edit`,
  interpretedIntent: "edit_request",
  citations: [seedCitation]
};

const validSellerUiPolicy: SellerUiPolicy = {
  sessionId: validLiveSessionSpec.sessionId,
  status: "seller_review_required",
  products: validProducts.map((product) => ({
    productId: product.id,
    title: product.title,
    sku: product.sku,
    priceLabel: `${product.currency} ${product.price.toFixed(2)}`,
    stockLabel: `${product.stock} in structured stock`,
    imageCount: product.media.images.length,
    missingFields: product.shopeeProductId ? [] : ["shopeeProductId"],
    reviewRequired: true
  })),
  photoEnhancement: validProducts.map((product) => ({
    productId: product.id,
    model: "gpt-image-2",
    sourceImageCount: product.media.images.length,
    promptCount: 3,
    requiresApproval: true
  })),
  publicAutomation: {
    autoSend: "low_risk_structured_only",
    approvalRequired: [
      "product listing creation",
      "discounts not backed by structured Shopee promo records",
      "material, warranty, or condition claims missing from structured records"
    ],
    blockedAutoSend: [
      "fake-product accusation",
      "fraud or legal threat",
      "refund commitment",
      "unauthorized discount",
      "unclear risky request"
    ]
  },
  renderHints: {
    sidePanelSectionId: "liveseller-prep-review",
    productAttribute: "data-liveseller-product-id",
    actionAttribute: "data-liveseller-action-id"
  }
};

export const validProductReviewPlan: ProductReviewPlan = {
  reviewPlanId: "review-live-seed-001",
  sessionId: validLiveSessionSpec.sessionId,
  generatedAt: now,
  updatedAt: now,
  status: "seller_review_required",
  items: validProducts.map((product) => ({
    productId: product.id,
    product,
    identityDraft: {
      productId: product.id,
      title: product.title,
      sku: product.sku,
      aliases: product.aliases,
      category: product.category,
      price: product.price,
      currency: product.currency,
      stock: product.stock,
      variantCount: product.variants.length,
      imageCount: product.media.images.length,
      sourceConfidence: product.sourceConfidence,
      identitySource: "structured_fixture",
      missingFields: product.shopeeProductId ? [] : ["shopeeProductId"],
      evidence: product.evidence
    },
    sellerGuidance: validReviewGuidance(product),
    photoEnhancementPlan: validImageGenerationPlan(product),
    aiUpdatableFields: [...reviewAiUpdatableFields],
    lockedStructuredFields: [...reviewLockedStructuredFields],
    draftUpdates: product.id === validAiDraftUpdate.productId ? [validAiDraftUpdate] : [],
    reviewRounds: [validReviewRound(product)],
    decision: {
      decisionId: `decision-${product.id}-pending`,
      productId: product.id,
      status: "pending",
      reason: "Seller has not reviewed this product listing draft.",
      citations: product.evidence
    }
  })),
  generationTasks: validProducts.flatMap((product) => validGenerationTasks(product)),
  sellerUiPolicy: validSellerUiPolicy,
  citations: [seedCitation]
};

export const validShopeeCreateProductCommand: ShopeeCreateProductCommand = {
  commandId: "cmd-create-prod-cooling-tee",
  sessionId: validLiveSessionSpec.sessionId,
  productId: validProducts[0]!.id,
  kind: "create_product",
  createdAt: "2026-06-06T02:20:00.000Z",
  approvalDecisionId: "decision-prod-cooling-tee-approved",
  approvalStatus: "approved",
  payload: {
    product: validProducts[0]!
  },
  citations: validProducts[0]!.evidence
};

const vintageJewelryCitation = {
  sourceId: "repo-vintage-jewelry-fixtures",
  sourceType: "image" as const,
  locator: "apps/prep/fixtures/seller-drop/vintage-jewelry",
  excerpt: "Repo fixture folder with vintage jewelry product images and Chinese social captions.",
  confidence: 0.86
};

function vintageImageCitation(fileName: string): EvidenceCitation {
  return {
    sourceId: "repo-vintage-jewelry-fixtures",
    sourceType: "image",
    locator: `apps/prep/fixtures/seller-drop/vintage-jewelry/${fileName}`,
    excerpt: `Seller supplied product photo copied from repo drop-folder file: ${fileName}`,
    confidence: 0.88
  };
}

function vintageImage(
  id: string,
  uri: string,
  alt: string,
  fileName: string
): ProductRecord["media"]["images"][number] {
  return {
    id,
    uri,
    alt,
    citations: [vintageImageCitation(fileName)]
  };
}

export const vintageJewelryProducts: ProductRecord[] = [
  {
    id: "prod-vintage-gold-grape-leaf-brooch",
    sku: "LS-VJ-GLB-001",
    title: "Vintage Gold-Tone Grape Leaf Brooch",
    aliases: ["gold grape brooch", "leaf brooch", "grape cluster pin", "金色葡萄胸针"],
    category: "Fashion Accessories > Brooches",
    description:
      "Vintage-style gold-tone brooch with layered leaf shapes and raised grape-cluster details, photographed in a jewelry case with warm floral styling.",
    price: 88,
    currency: "SGD",
    variants: [
      {
        id: "gold-grape-leaf-one-size",
        name: "Gold-tone / One size",
        sku: "LS-VJ-GLB-001-OS",
        priceDelta: 0,
        stock: 1,
        attributes: { color: "Gold-tone", style: "Brooch" }
      }
    ],
    stock: 1,
    dimensions: { weightGrams: 24, lengthCm: 6.5, widthCm: 3.4, heightCm: 1.8 },
    shipping: {
      originCountry: "SG",
      shipWithinDays: 2,
      supportedMethods: ["Shopee Standard", "NinjaVan"],
      freeShipping: false
    },
    returnPolicy: {
      windowDays: 7,
      conditions: ["Unused", "Original packaging", "No new scratches or pin damage"],
      exclusions: ["Vintage patina", "Minor age-related wear disclosed before purchase"]
    },
    media: {
      images: [
        vintageImage(
          "gold-grape-leaf-brooch-01",
          "/assets/products/vintage-jewelry/gold-grape-leaf-brooch-01.jpg",
          "Gold-tone grape and leaf brooch in a velvet jewelry case",
          "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰.jpg"
        ),
        vintageImage(
          "gold-grape-leaf-brooch-02",
          "/assets/products/vintage-jewelry/gold-grape-leaf-brooch-02.jpg",
          "Gold grape leaf brooch alternate angle",
          "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰 (1).jpg"
        ),
        vintageImage(
          "gold-grape-leaf-brooch-03",
          "/assets/products/vintage-jewelry/gold-grape-leaf-brooch-03.jpg",
          "Gold grape leaf brooch close-up",
          "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰 (2).jpg"
        ),
        vintageImage(
          "gold-grape-leaf-brooch-04",
          "/assets/products/vintage-jewelry/gold-grape-leaf-brooch-04.jpg",
          "Gold-tone leaves and grape cluster detail",
          "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰 (3).jpg"
        ),
        vintageImage(
          "gold-grape-leaf-brooch-05",
          "/assets/products/vintage-jewelry/gold-grape-leaf-brooch-05.jpg",
          "Gold vintage brooch styled with orange flowers",
          "金色新品合集。#小众饰品分享 #中古饰品 #中古首饰直播 #中古首饰 (4).jpg"
        )
      ],
      videos: []
    },
    evidence: [vintageJewelryCitation],
    sourceConfidence: 0.86,
    listingDraft: {
      title: "Vintage Gold-Tone Grape Leaf Brooch",
      description:
        "A one-of-one vintage-style gold-tone brooch with sculpted leaves and grape-cluster texture. Best for blazers, scarves, dresses, and collector styling.",
      bulletPoints: [
        "One available; structured stock is 1",
        "Gold-tone botanical grape-and-leaf design",
        "Vintage item: small age-related marks should be expected",
        "Seller should confirm metal composition before making material claims"
      ]
    }
  },
  {
    id: "prod-vintage-blue-stone-bar-brooch",
    sku: "LS-VJ-BSB-002",
    title: "Vintage Blue Stone Bar Brooch",
    aliases: ["blue brooch", "turquoise bar brooch", "blue rhinestone pin", "蓝色宝石胸针"],
    category: "Fashion Accessories > Brooches",
    description:
      "Statement bar brooch with blue cabochon-style stones, bright rhinestone accents, and textured silver-tone bars.",
    price: 118,
    currency: "SGD",
    variants: [
      {
        id: "blue-stone-bar-one-size",
        name: "Blue stones / One size",
        sku: "LS-VJ-BSB-002-OS",
        priceDelta: 0,
        stock: 1,
        attributes: { color: "Blue", style: "Bar brooch" }
      }
    ],
    stock: 1,
    dimensions: { weightGrams: 28, lengthCm: 7.2, widthCm: 2.8, heightCm: 1.5 },
    shipping: {
      originCountry: "SG",
      shipWithinDays: 2,
      supportedMethods: ["Shopee Standard", "NinjaVan"],
      freeShipping: false
    },
    returnPolicy: {
      windowDays: 7,
      conditions: ["Unused", "Original packaging", "No missing stones after receipt"],
      exclusions: ["Vintage patina", "Minor age-related wear disclosed before purchase"]
    },
    media: {
      images: [
        vintageImage(
          "blue-stone-bar-brooch-01",
          "/assets/products/vintage-jewelry/blue-stone-bar-brooch-01.jpg",
          "Blue stone and rhinestone bar brooch in a velvet jewelry case",
          "新品又上一组。#中古饰品 #中古首饰 #中古首饰直播 #中古首饰vintage #中古风.jpg"
        ),
        vintageImage(
          "blue-stone-bar-brooch-02",
          "/assets/products/vintage-jewelry/blue-stone-bar-brooch-02.jpg",
          "Blue stone bar brooch alternate angle",
          "新品又上一组。#中古饰品 #中古首饰 #中古首饰直播 #中古首饰vintage #中古风 (1).jpg"
        ),
        vintageImage(
          "blue-stone-bar-brooch-03",
          "/assets/products/vintage-jewelry/blue-stone-bar-brooch-03.jpg",
          "Blue bar brooch close-up with rhinestones",
          "新品又上一组。#中古饰品 #中古首饰 #中古首饰直播 #中古首饰vintage #中古风 (2).jpg"
        ),
        vintageImage(
          "blue-stone-bar-brooch-04",
          "/assets/products/vintage-jewelry/blue-stone-bar-brooch-04.jpg",
          "Vintage blue brooch styled with orange flowers",
          "新品又上一组。#中古饰品 #中古首饰 #中古首饰直播 #中古首饰vintage #中古风 (3).jpg"
        )
      ],
      videos: []
    },
    evidence: [vintageJewelryCitation],
    sourceConfidence: 0.86,
    listingDraft: {
      title: "Vintage Blue Stone Bar Brooch",
      description:
        "A bright vintage statement brooch with blue cabochon-style stones, rhinestone sparkle, and textured silver-tone bar details.",
      bulletPoints: [
        "One available; structured stock is 1",
        "Blue stones and rhinestone centerpiece",
        "Works as a scarf, lapel, or dress accent",
        "Stone identity should be described visually unless seller has certificate"
      ]
    }
  },
  {
    id: "prod-vintage-cameo-brooch",
    sku: "LS-VJ-CAM-003",
    title: "Vintage Cream Cameo Brooch",
    aliases: ["cameo brooch", "cream cameo pin", "portrait brooch", "卡梅奥胸针"],
    category: "Fashion Accessories > Brooches",
    description:
      "Round cameo-style brooch with cream portrait relief, soft pink base, and gold-tone rim, styled in a vintage jewelry case.",
    price: 138,
    currency: "SGD",
    variants: [
      {
        id: "cream-cameo-one-size",
        name: "Cream cameo / One size",
        sku: "LS-VJ-CAM-003-OS",
        priceDelta: 0,
        stock: 1,
        attributes: { color: "Cream", style: "Cameo brooch" }
      }
    ],
    stock: 1,
    dimensions: { weightGrams: 32, lengthCm: 5.1, widthCm: 5.1, heightCm: 1.6 },
    shipping: {
      originCountry: "SG",
      shipWithinDays: 2,
      supportedMethods: ["Shopee Standard", "NinjaVan"],
      freeShipping: false
    },
    returnPolicy: {
      windowDays: 7,
      conditions: ["Unused", "Original packaging", "No new chips or pin damage"],
      exclusions: ["Vintage patina", "Minor age-related wear disclosed before purchase"]
    },
    media: {
      images: [
        vintageImage(
          "cameo-brooch-01",
          "/assets/products/vintage-jewelry/cameo-brooch-01.jpg",
          "Cream cameo brooch in a velvet jewelry case",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享.jpg"
        ),
        vintageImage(
          "cameo-brooch-02",
          "/assets/products/vintage-jewelry/cameo-brooch-02.jpg",
          "Cream cameo brooch alternate angle",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (1).jpg"
        ),
        vintageImage(
          "cameo-brooch-03",
          "/assets/products/vintage-jewelry/cameo-brooch-03.jpg",
          "Cameo portrait relief close-up",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (2).jpg"
        ),
        vintageImage(
          "cameo-brooch-04",
          "/assets/products/vintage-jewelry/cameo-brooch-04.jpg",
          "Cameo brooch with gold-tone rim",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (3).jpg"
        ),
        vintageImage(
          "cameo-brooch-05",
          "/assets/products/vintage-jewelry/cameo-brooch-05.jpg",
          "Cameo brooch side-lit detail",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (4).jpg"
        ),
        vintageImage(
          "cameo-brooch-06",
          "/assets/products/vintage-jewelry/cameo-brooch-06.jpg",
          "Vintage cameo brooch in presentation box",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (5).jpg"
        ),
        vintageImage(
          "cameo-brooch-07",
          "/assets/products/vintage-jewelry/cameo-brooch-07.jpg",
          "Cream cameo brooch with floral styling",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (6).jpg"
        ),
        vintageImage(
          "cameo-brooch-08",
          "/assets/products/vintage-jewelry/cameo-brooch-08.jpg",
          "Round cameo brooch close-up",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (7).jpg"
        ),
        vintageImage(
          "cameo-brooch-09",
          "/assets/products/vintage-jewelry/cameo-brooch-09.jpg",
          "Cameo brooch portrait and rim detail",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (8).jpg"
        ),
        vintageImage(
          "cameo-brooch-10",
          "/assets/products/vintage-jewelry/cameo-brooch-10.jpg",
          "Vintage cream cameo brooch final angle",
          "新鲜出炉的卡霉霉。#中古种草指南 #中古饰品 #中古首饰 #中古首饰vintage #中古首饰分享 (9).jpg"
        )
      ],
      videos: []
    },
    evidence: [vintageJewelryCitation],
    sourceConfidence: 0.87,
    listingDraft: {
      title: "Vintage Cream Cameo Brooch",
      description:
        "A romantic cameo-style brooch with cream portrait relief, pink-toned backing, and a gold-tone rim. Strong hero piece for vintage jewelry lives.",
      bulletPoints: [
        "One available; structured stock is 1",
        "Cream portrait relief with gold-tone rim",
        "Best shown close to camera so buyers can inspect carving depth",
        "Avoid claiming shell, stone, or era unless certificate is supplied"
      ]
    }
  }
];

export const vintageJewelryPromo: PromoRecord = {
  id: "promo-vintage-live-showcase",
  type: "fixed_amount",
  title: "Vintage Live Showcase",
  discount: { value: 8, currency: "SGD" },
  minSpend: 80,
  eligibleProductIds: vintageJewelryProducts.map((product) => product.id),
  startAt: "2026-06-06T02:00:00.000Z",
  endAt: "2026-06-06T04:00:00.000Z",
  remainingQuantity: 3,
  source: "seller_note",
  riskNotes: ["Overlay-only until seller confirms Shopee voucher setup."],
  citations: [vintageJewelryCitation]
};

export const vintageJewelryPolicyPack: PolicyPack = {
  id: "policy-vintage-jewelry-sg-v1",
  market: "SG",
  languages: ["en", "zh", "ms", "ta"],
  safeFaq: [
    {
      id: "faq-vintage-condition",
      question: "Is there visible wear?",
      answer:
        "These are vintage pieces, so minor age-related patina or small marks may be present. The seller should show close-ups before checkout.",
      language: "en",
      citations: [vintageJewelryCitation]
    },
    {
      id: "faq-vintage-material",
      question: "Is it real gold or gemstone?",
      answer:
        "Only describe visible color and design unless a certificate or seller record confirms the material.",
      language: "en",
      citations: [vintageJewelryCitation]
    }
  ],
  shippingPolicy: "Vintage jewelry ships from Singapore within 2 working days with protective packaging.",
  returnPolicy:
    "Unused items may be reviewed within 7 days. Vintage patina or disclosed age-related marks are not treated as new defects.",
  restrictedClaims: [
    "precious metal purity without certificate",
    "natural gemstone identity without certificate",
    "guaranteed era or brand attribution without seller record",
    "official Shopee discount unless verified"
  ],
  escalationTriggers: [
    "authenticity accusation",
    "refund commitment",
    "legal threat",
    "fraud allegation",
    "unauthorized discount"
  ],
  citations: [vintageJewelryCitation]
};

export const vintageJewelryLiveSessionSpec: LiveSessionSpec = {
  sessionId: "live-vintage-jewelry-001",
  shopId: "shop-sg-demo",
  title: "Vintage Jewelry Live Showcase",
  targetLanguages: ["en", "zh", "ms", "ta"],
  products: vintageJewelryProducts,
  promos: [vintageJewelryPromo],
  policyPack: vintageJewelryPolicyPack,
  retrievalRefs: [
    {
      refId: "retrieval-vintage-jewelry-drop",
      sourceId: "repo-vintage-jewelry-fixtures",
      productIds: vintageJewelryProducts.map((product) => product.id),
      policyIds: [vintageJewelryPolicyPack.id],
      languages: ["en", "zh", "ms", "ta"]
    }
  ],
  approvalMode: "hybrid",
  enabledTools: validLiveSessionSpec.enabledTools
};

export const validShopeeStartLivestreamCommand: ShopeeStartLivestreamCommand = {
  commandId: "cmd-prepare-livestream-vintage-jewelry",
  sessionId: vintageJewelryLiveSessionSpec.sessionId,
  kind: "prepare_livestream",
  createdAt: "2026-06-06T02:45:00.000Z",
  approvalId: "approval-prepare-livestream-vintage-jewelry",
  approvalStatus: "approved",
  safetyMode: "create_session_capture_credentials",
  payload: {
    title: vintageJewelryLiveSessionSpec.title,
    productIds: vintageJewelryLiveSessionSpec.products.map((product) => product.id),
    publicOverlayUrl: "/?runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001",
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
  citations: [vintageJewelryCitation]
};

export const vintageJewelrySessionMemory: SessionMemory = {
  sessionId: vintageJewelryLiveSessionSpec.sessionId,
  topQuestions: [
    "Is the brooch real gold?",
    "Can I see the cameo close up?",
    "Any discount for the blue brooch?"
  ],
  languageCounts: { en: 2, zh: 3, ms: 1, ta: 0 },
  productInterest: {
    "prod-vintage-gold-grape-leaf-brooch": 2,
    "prod-vintage-blue-stone-bar-brooch": 3,
    "prod-vintage-cameo-brooch": 4
  },
  escalations: [],
  recommendations: [
    "Open with the cameo brooch because the carved portrait reads clearly on camera.",
    "After the cameo, show the blue stone bar brooch under direct light to catch sparkle.",
    "For material questions, describe visible color and construction unless the seller has certificates."
  ],
  updatedAt: now
};

export const validRuntimeEvents: RuntimeEvent[] = [
  {
    eventId: "event-chat-price",
    sessionId: validLiveSessionSpec.sessionId,
    timestamp: now,
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId: "viewer-001",
      viewerName: "Alicia",
      text: "How much is the bamboo tee?",
      language: "en"
    }
  },
  {
    eventId: "event-host-zh",
    sessionId: validLiveSessionSpec.sessionId,
    timestamp: now,
    source: "host",
    type: "host_transcript",
    payload: {
      text: "这件竹纤维T恤今天直播很适合新加坡天气",
      language: "zh",
      confidence: 0.93
    }
  }
];

export const validLiveAction: LiveAction = {
  actionId: "action-send-price",
  sessionId: validLiveSessionSpec.sessionId,
  createdAt: now,
  type: "send_reply",
  risk: "low",
  reason: "Low-risk factual price answer from ProductRecord.",
  citations: [seedCitation],
  requiresApproval: false,
  payload: {
    kind: "send_reply",
    viewerId: "viewer-001",
    text: "The Bamboo Cooling Tee is SGD 19.90.",
    language: "en",
    productId: "prod-cooling-tee"
  }
};

export const validOverlayState: OverlayState = {
  sessionId: validLiveSessionSpec.sessionId,
  currentProductId: "prod-cooling-tee",
  caption: {
    text: "这件竹纤维T恤今天直播很适合新加坡天气",
    language: "zh",
    visible: true
  },
  translatedCaptions: [
    {
      language: "en",
      text: "This bamboo cooling tee is great for Singapore weather today."
    }
  ],
  productCard: {
    productId: "prod-cooling-tee",
    title: "Bamboo Cooling Tee",
    price: 19.9,
    currency: "SGD",
    stock: 42,
    imageUri: "/assets/products/cooling-tee.jpg"
  },
  promoBanner: {
    promoId: "promo-flash-10",
    title: "Live Flash 10% Off",
    remainingQuantity: 50,
    endsAt: validPromo.endAt,
    backing: "overlay_only"
  },
  audioMix: {
    sourceVolume: 1,
    translatedVolume: 0.75
  },
  background: {
    mode: "default",
    value: "default",
    label: "Default overlay background"
  },
  layoutWarnings: [],
  updatedAt: now
};

export const validAuditEvent: AuditEvent = {
  auditId: "audit-action-send-price",
  sessionId: validLiveSessionSpec.sessionId,
  timestamp: now,
  kind: "model_action",
  actor: "runtime",
  reason: "Runtime emitted low-risk factual action.",
  action: validLiveAction
};

export const validSellerTimelineEvent: SellerTimelineEvent = {
  id: "timeline-viewer-message",
  timestamp: now,
  service: "runtime",
  sessionId: validLiveSessionSpec.sessionId,
  kind: "viewer_message",
  status: "success",
  title: "Viewer message from Alicia",
  detail: "How much is the bamboo tee?",
  subjectId: "viewer-001",
  sourceEventId: "event-chat-price",
  approvalState: "none",
  redacted: false
};

export const badFixtures = {
  negativeStockProduct: {
    ...validProducts[0],
    stock: -1
  },
  privateLiveActionPayload: {
    ...validLiveAction,
    payload: {
      ...validLiveAction.payload,
      forbiddenPrivateField: "browser payloads must not carry private fields"
    }
  },
  mismatchedActionPayload: {
    ...validLiveAction,
    type: "draft_reply"
  },
  aiDraftUpdateChangesLockedPrice: {
    ...validAiDraftUpdate,
    patch: {
      ...validAiDraftUpdate.patch,
      price: 1
    }
  },
  productReviewPlanIdMismatch: {
    ...validProductReviewPlan,
    items: [
      {
        ...validProductReviewPlan.items[0]!,
        identityDraft: {
          ...validProductReviewPlan.items[0]!.identityDraft,
          productId: "prod-other"
        }
      }
    ]
  },
  editedDecisionWithoutEditedProduct: {
    ...validProductReviewPlan,
    items: [
      {
        ...validProductReviewPlan.items[0]!,
        decision: {
          decisionId: "decision-prod-cooling-tee-edited",
          productId: validProductReviewPlan.items[0]!.productId,
          status: "edited",
          decidedBy: "seller",
          decidedAt: "2026-06-06T02:15:00.000Z",
          reason: "Seller edited the product listing draft.",
          citations: validProductReviewPlan.items[0]!.product.evidence
        }
      }
    ]
  },
  productReviewPlanWithoutOptions: {
    ...validProductReviewPlan,
    items: [
      {
        ...validProductReviewPlan.items[0]!,
        reviewRounds: [
          {
            ...validProductReviewPlan.items[0]!.reviewRounds[0]!,
            options: []
          }
        ]
      }
    ]
  }
} as const;
