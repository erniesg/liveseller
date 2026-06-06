import { describe, expect, it } from "vitest";
import { inferSellerIntent } from "./liveOneImageReviewSmoke";

describe("live one-image review smoke helpers", () => {
  it("treats change requests as edits even when approval is mentioned as a future gate", () => {
    expect(
      inferSellerIntent("Please make the title shorter and show me another image prompt option before I approve.")
    ).toBe("edit_request");
    expect(inferSellerIntent("Approved, go ahead.")).toBe("approve");
    expect(inferSellerIntent("Show me more options.")).toBe("more_options");
  });
});
