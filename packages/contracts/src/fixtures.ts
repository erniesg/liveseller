import type {
  AuditEvent,
  LiveAction,
  LiveSessionSpec,
  OverlayState,
  PolicyPack,
  ProductRecord,
  PromoRecord,
  RuntimeEvent,
  SessionMemory,
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
  }
} as const;
