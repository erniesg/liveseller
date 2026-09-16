import type {
  LanguageCode,
  LiveSessionSpec,
  ProductRecord,
  RiskLevel,
  RuntimeEvent
} from "@liveseller/contracts";

export type PolicyDecision = {
  rule: string;
  risk: RiskLevel;
  behavior: "send_reply" | "draft_reply" | "escalate" | "request_approval" | "ignore";
  reason: string;
};

const riskRules: Array<{
  rule: string;
  risk: RiskLevel;
  behavior: PolicyDecision["behavior"];
  reason: string;
  pattern: RegExp;
}> = [
  {
    rule: "legal_threat",
    risk: "high",
    behavior: "escalate",
    reason: "Legal threats require seller handling and must not be answered publicly.",
    pattern: /\b(lawyer|sue|legal|court|police|report you)\b|律师|起诉|报警|mahkamah|polis|சட்ட/iu
  },
  {
    rule: "fake_or_counterfeit",
    risk: "high",
    behavior: "escalate",
    reason: "Authenticity accusations require seller review before any public response.",
    pattern: /\b(fake|counterfeit|not original|authentic)\b|假货| counterfeit |palsu|போலி/iu
  },
  {
    rule: "fraud_allegation",
    risk: "high",
    behavior: "escalate",
    reason: "Fraud allegations must be escalated and audited.",
    pattern: /\b(scam|fraud|cheat|cheated)\b|诈骗|欺骗|penipu|மோசடி/iu
  },
  {
    rule: "refund_request",
    risk: "medium",
    behavior: "draft_reply",
    reason: "Refund questions can use policy text but require seller review before public posting.",
    pattern: /\b(refund|return|money back|cancel order)\b|退款|退货|pulangkan|bayaran balik|திருப்பி/iu
  },
  {
    rule: "discount_negotiation",
    risk: "medium",
    behavior: "request_approval",
    reason: "Discount negotiation may create unauthorized pricing commitments.",
    pattern: /\b(discount|cheaper|lower price|best price|extra voucher)\b|便宜|折扣|murah|diskaun|தள்ளுபடி/iu
  }
];

export function detectLanguage(text: string, provided?: LanguageCode): LanguageCode {
  if (provided) {
    return provided;
  }
  if (/[\u4e00-\u9fff]/u.test(text)) {
    return "zh";
  }
  if (/\b(berapa|harga|stok|penghantaran|diskaun|murah)\b/iu.test(text)) {
    return "ms";
  }
  if (/[\u0b80-\u0bff]/u.test(text)) {
    return "ta";
  }
  return "en";
}

export function classifyViewerMessage(text: string): PolicyDecision {
  const normalized = text.trim().toLowerCase();
  const matchedRule = riskRules.find((rule) => rule.pattern.test(text));
  if (matchedRule) {
    return {
      rule: matchedRule.rule,
      risk: matchedRule.risk,
      behavior: matchedRule.behavior,
      reason: matchedRule.reason
    };
  }

  if (/^(hi+|h+i+\s*|hello+|hey+|yo+|thanks?|thank you|ok+|wow+|nice+|buy buy buy|[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+)$/iu.test(normalized)) {
    return {
      rule: "viewer_smalltalk",
      risk: "low",
      behavior: "ignore",
      reason: "Greeting, reaction, or hype message does not need a product fact reply."
    };
  }

  if (!/[?？]|\b(price|how much|多少钱|多少|harga|ship|shipping|delivery|deliver|where|stock|available|left|size|dimension|measure|measurement|weight|heavy|light|ring|brooch|pendant|necklace|this)\b|运|寄|库存|尺寸|重量|penghantaran|hantar|stok|saiz|berat|விலை|என்ன|அனுப்ப|இருப்பு|அளவு|எடை/iu.test(normalized)) {
    return {
      rule: "viewer_no_product_intent",
      risk: "low",
      behavior: "ignore",
      reason: "Viewer message has no product, shipping, price, stock, or size intent."
    };
  }

  return {
    rule: "safe_factual",
    risk: "low",
    behavior: "send_reply",
    reason: "Low-risk factual answer can be generated from structured product and policy records."
  };
}

export function resolveProduct(text: string, session: LiveSessionSpec): ProductRecord {
  const normalized = text.toLowerCase();
  const product = session.products.find((candidate) => {
    const aliases = [candidate.title, candidate.sku, ...candidate.aliases];
    return aliases.some((alias) => normalized.includes(alias.toLowerCase()));
  });

  const fallback = session.products[0];
  if (!fallback) {
    throw new Error("LiveSessionSpec must include at least one product");
  }
  return product ?? fallback;
}

export function findRelevantCitations(product: ProductRecord, session: LiveSessionSpec) {
  return [...product.evidence, ...session.policyPack.citations].slice(0, 4);
}

export function buildSafeReplyText(
  text: string,
  product: ProductRecord,
  session: LiveSessionSpec,
  language: LanguageCode
): string {
  const lower = text.toLowerCase();
  const price = `${product.currency} ${product.price.toFixed(2)}`;
  const sizeLabel = `${product.dimensions.lengthCm} x ${product.dimensions.widthCm} x ${product.dimensions.heightCm} cm`;
  const weightLabel = `${product.dimensions.weightGrams}g`;
  const asksShipping = /\b(ship|shipping|delivery|deliver)\b|运|penghantaran|அனுப்ப/iu.test(lower);
  const asksShippingDestination = /\b(ship|deliver|delivery)\s+to\b|\bwhere\b.*\b(ship|deliver|delivery)\b|运到|寄到|hantar ke|penghantaran ke/iu.test(lower);
  const asksPrice = /\b(price|how much|多少钱|多少|harga|விலை)\b|\$\?/iu.test(lower);

  if (asksPrice && asksShipping) {
    if (language === "zh") {
      return asksShippingDestination
        ? `${product.title} 是 ${price}，目前库存 ${product.stock} 件；本场支持新加坡本地配送，从新加坡发货，通常 ${product.shipping.shipWithinDays}-3 个工作日内发出。`
        : `${product.title} 是 ${price}，目前库存 ${product.stock} 件；我们从新加坡发货，通常 ${product.shipping.shipWithinDays}-3 个工作日内发出。`;
    }
    if (language === "ms") {
      return asksShippingDestination
        ? `${product.title} berharga ${price}, stok ${product.stock} unit; penghantaran tempatan Singapura disokong dan dihantar dari Singapura dalam ${product.shipping.shipWithinDays}-3 hari bekerja.`
        : `${product.title} berharga ${price}, stok ${product.stock} unit; kami hantar dari Singapura dalam ${product.shipping.shipWithinDays}-3 hari bekerja.`;
    }
    if (language === "ta") {
      return asksShippingDestination
        ? `${product.title} விலை ${price}; ${product.stock} யூனிட் உள்ளது. சிங்கப்பூர் உள்ளூர் டெலிவரி ஆதரிக்கப்படுகிறது; சிங்கப்பூரிலிருந்து ${product.shipping.shipWithinDays}-3 வேலை நாட்களில் அனுப்பப்படும்.`
        : `${product.title} விலை ${price}; ${product.stock} யூனிட் உள்ளது. சிங்கப்பூரிலிருந்து ${product.shipping.shipWithinDays}-3 வேலை நாட்களில் அனுப்பப்படும்.`;
    }
    return asksShippingDestination
      ? `${product.title} is ${price}; ${product.stock} available. We support Singapore local delivery and ship from Singapore within ${product.shipping.shipWithinDays}-3 working days.`
      : `${product.title} is ${price}; ${product.stock} available. Ships from Singapore within ${product.shipping.shipWithinDays}-3 working days.`;
  }

  if (asksShipping) {
    if (asksShippingDestination) {
      if (language === "zh") {
        return `本场支持新加坡本地配送，从新加坡发货，通常 ${product.shipping.shipWithinDays}-3 个工作日内发出。`;
      }
      if (language === "ms") {
        return `Penghantaran tempatan Singapura disokong; kami hantar dari Singapura dalam ${product.shipping.shipWithinDays}-3 hari bekerja.`;
      }
      if (language === "ta") {
        return `சிங்கப்பூர் உள்ளூர் டெலிவரி ஆதரிக்கப்படுகிறது; சிங்கப்பூரிலிருந்து ${product.shipping.shipWithinDays}-3 வேலை நாட்களில் அனுப்பப்படும்.`;
      }
      return `We support Singapore local delivery and ship from Singapore within ${product.shipping.shipWithinDays}-3 working days.`;
    }
    const message = session.policyPack.shippingPolicy;
    if (language === "zh") {
      return `我们从新加坡发货，通常 ${product.shipping.shipWithinDays}-3 个工作日内发出。`;
    }
    if (language === "ms") {
      return `Kami hantar dari Singapura dalam ${product.shipping.shipWithinDays}-3 hari bekerja.`;
    }
    if (language === "ta") {
      return `சிங்கப்பூரிலிருந்து ${product.shipping.shipWithinDays}-3 வேலை நாட்களில் அனுப்பப்படும்.`;
    }
    return message;
  }

  if (/\b(size|dimension|measure|measurement|big|small|weight|heavy|light)\b|尺寸|大小|重量|saiz|berat|அளவு|எடை/iu.test(lower)) {
    if (language === "zh") {
      return `${product.title} 尺寸约 ${sizeLabel}，重量约 ${weightLabel}。`;
    }
    if (language === "ms") {
      return `${product.title} bersaiz kira-kira ${sizeLabel}, berat sekitar ${weightLabel}.`;
    }
    if (language === "ta") {
      return `${product.title} அளவு சுமார் ${sizeLabel}, எடை சுமார் ${weightLabel}.`;
    }
    return `${product.title} is about ${sizeLabel}, with an estimated weight of ${weightLabel}.`;
  }

  if (/\b(stock|available|left)\b|库存|stok|இருப்பு/iu.test(lower)) {
    if (language === "zh") {
      return `${product.title} 现在还有 ${product.stock} 件库存。`;
    }
    if (language === "ms") {
      return `${product.title} masih ada ${product.stock} unit stok.`;
    }
    if (language === "ta") {
      return `${product.title} இப்போது ${product.stock} யூனிட் உள்ளது.`;
    }
    return `${product.title} has ${product.stock} units available.`;
  }

  if (language === "zh") {
    return `${product.title} 是 ${price}，现在库存 ${product.stock} 件。`;
  }
  if (language === "ms") {
    return `${product.title} berharga ${price}, stok semasa ${product.stock} unit.`;
  }
  if (language === "ta") {
    return `${product.title} விலை ${price}; இப்போது ${product.stock} யூனிட் உள்ளது.`;
  }
  return `${product.title} is ${price}; current stock is ${product.stock} units.`;
}

export function isFlashPromoAnnouncement(event: RuntimeEvent): boolean {
  return (
    event.type === "host_transcript" &&
    /\b(flash promo|flash deal|voucher|limited time)\b|限时|直播优惠|promo kilat|சிறப்பு/iu.test(
      event.payload.text
    )
  );
}

export function translateCaption(text: string, sourceLanguage: LanguageCode): string {
  if (sourceLanguage === "zh") {
    if (text.includes("竹纤维") || text.includes("T恤")) {
      return "This bamboo cooling tee is great for Singapore weather today.";
    }
    if (text.includes("直播优惠") || text.includes("限时")) {
      return "This is a limited-time livestream promo.";
    }
    return "The host is introducing the current product.";
  }

  if (sourceLanguage === "ms") {
    return "The host is introducing the current product in Malay.";
  }

  if (sourceLanguage === "ta") {
    return "The host is introducing the current product in Tamil.";
  }

  return text;
}
