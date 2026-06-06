import type { LanguageCode } from "@liveseller/contracts";
import { translateCaption } from "./policy";

export type CaptionTranslationInput = {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
};

export type CaptionTranslationResult = {
  text: string;
  provider: "deterministic" | "openai";
};

function languageName(language: LanguageCode): string {
  const names: Record<LanguageCode, string> = {
    en: "English",
    zh: "Chinese",
    ms: "Malay",
    ta: "Tamil"
  };
  return names[language];
}

function extractResponseText(responseBody: unknown): string | undefined {
  if (
    responseBody &&
    typeof responseBody === "object" &&
    "output_text" in responseBody &&
    typeof responseBody.output_text === "string"
  ) {
    return responseBody.output_text.trim();
  }

  if (!responseBody || typeof responseBody !== "object" || !("output" in responseBody)) {
    return undefined;
  }

  const output = responseBody.output;
  if (!Array.isArray(output)) {
    return undefined;
  }

  const textParts = output.flatMap((item) => {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
      return [];
    }
    return item.content.flatMap((content: unknown) => {
      if (
        content &&
        typeof content === "object" &&
        "text" in content &&
        typeof content.text === "string"
      ) {
        return [content.text];
      }
      return [];
    });
  });

  return textParts.join("").trim() || undefined;
}

async function translateWithOpenAI(
  input: CaptionTranslationInput,
  apiKey: string,
  model: string
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions:
        "Translate livestream host captions for a Shopee Live commerce overlay. Return only the translated sentence, preserving product names and prices.",
      input: `Translate from ${languageName(input.sourceLanguage)} to ${languageName(
        input.targetLanguage
      )}: ${input.text}`,
      max_output_tokens: 120
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI translation failed with HTTP ${response.status}`);
  }

  const translated = extractResponseText(await response.json());
  if (!translated) {
    throw new Error("OpenAI translation returned no text");
  }
  return translated;
}

export async function translateCaptionForRuntime(
  input: CaptionTranslationInput,
  options: {
    apiKey?: string;
    model?: string;
  } = {}
): Promise<CaptionTranslationResult> {
  if (options.apiKey) {
    try {
      return {
        text: await translateWithOpenAI(input, options.apiKey, options.model ?? "gpt-4o-mini"),
        provider: "openai"
      };
    } catch {
      // Keep the local demo resilient; audit/action reasons still show server-owned translation.
    }
  }

  return {
    text: translateCaption(input.text, input.sourceLanguage, input.targetLanguage),
    provider: "deterministic"
  };
}
