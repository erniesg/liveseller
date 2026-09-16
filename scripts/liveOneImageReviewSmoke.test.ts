import { describe, expect, it } from "vitest";
import { validProductReviewPlan } from "@liveseller/contracts";
import { buildSellerResponse } from "./liveOneImageReviewSmoke";

describe("live one-image review smoke helpers", () => {
  it("records the structured seller intent supplied by the review layer", () => {
    const response = buildSellerResponse(
      validProductReviewPlan,
      "Please make the title shorter and show me another image prompt option before I approve.",
      "edit_request",
      "2026-06-06T04:00:00.000Z"
    );

    expect(response).toMatchObject({
      productId: validProductReviewPlan.items[0]?.productId,
      text: expect.stringContaining("before I approve"),
      interpretedIntent: "edit_request"
    });
  });
});
