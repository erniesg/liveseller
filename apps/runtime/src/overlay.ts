import {
  type LiveAction,
  type LiveSessionSpec,
  type ProductRecord,
  type OverlayState,
  OverlayStateSchema
} from "@liveseller/contracts";

function firstProduct(session: LiveSessionSpec): ProductRecord {
  const product = session.products[0];
  if (!product) {
    throw new Error("LiveSessionSpec must include at least one product");
  }
  return product;
}

export function createInitialOverlayState(session: LiveSessionSpec): OverlayState {
  const product = firstProduct(session);
  const promo = session.promos[0];

  return OverlayStateSchema.parse({
    sessionId: session.sessionId,
    currentProductId: product.id,
    caption: {
      text: "",
      language: session.targetLanguages[0],
      visible: true
    },
    translatedCaptions: [],
    productCard: {
      productId: product.id,
      title: product.title,
      price: product.price,
      currency: product.currency,
      stock: product.stock,
      imageUri: product.media.images[0]?.uri ?? "/assets/products/placeholder.jpg"
    },
    promoBanner: promo
      ? {
          promoId: promo.id,
          title: promo.title,
          remainingQuantity: promo.remainingQuantity,
          endsAt: promo.endAt,
          backing: promo.source === "shopee" ? "shopee" : "overlay_only"
        }
      : undefined,
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
    updatedAt: new Date().toISOString()
  });
}

export function applyOverlayActions(
  session: LiveSessionSpec,
  actions: LiveAction[],
  previous = createInitialOverlayState(session)
): OverlayState {
  const next: OverlayState = structuredClone(previous);

  for (const action of actions) {
    if (action.type === "update_caption" && action.payload.kind === "update_caption") {
      next.caption = {
        text: action.payload.text,
        language: action.payload.language,
        visible: action.payload.visible
      };
    }

    if (action.type === "emit_translation" && action.payload.kind === "emit_translation") {
      const payload = action.payload;
      next.translatedCaptions = [
        ...next.translatedCaptions.filter(
          (caption) => caption.language !== payload.targetLanguage
        ),
        {
          language: payload.targetLanguage,
          text: payload.text
        }
      ];
    }

    if (action.type === "show_product_card" && action.payload.kind === "show_product_card") {
      const payload = action.payload;
      const product = session.products.find((candidate) => candidate.id === payload.productId);
      if (product) {
        next.currentProductId = product.id;
        next.productCard = {
          productId: product.id,
          title: product.title,
          price: product.price,
          currency: product.currency,
          stock: product.stock,
          imageUri: product.media.images[0]?.uri ?? "/assets/products/placeholder.jpg"
        };
      }
    }

    if (action.type === "show_promo_banner" && action.payload.kind === "show_promo_banner") {
      const payload = action.payload;
      const promo = session.promos.find((candidate) => candidate.id === payload.promoId);
      if (promo) {
        next.promoBanner = {
          promoId: promo.id,
          title: promo.title,
          remainingQuantity: promo.remainingQuantity,
          endsAt: promo.endAt,
          backing: payload.backing
        };
      }
    }
  }

  next.layoutWarnings = validateOverlayLayout(next);
  next.updatedAt = new Date().toISOString();
  return OverlayStateSchema.parse(next);
}

export function validateOverlayLayout(state: OverlayState): string[] {
  const warnings: string[] = [];
  if (state.caption.text.length > 160) {
    warnings.push("caption_text_exceeds_safe_length");
  }
  for (const caption of state.translatedCaptions) {
    if (caption.text.length > 180) {
      warnings.push(`translated_caption_${caption.language}_exceeds_safe_length`);
    }
  }
  if (state.productCard && state.productCard.title.length > 70) {
    warnings.push("product_title_exceeds_safe_length");
  }
  return warnings;
}
