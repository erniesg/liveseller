import {
  type ProductReviewDecision,
  SellerTimelineResponseSchema,
  validProductReviewPlan,
  validSellerFreeFormReviewResponse
} from "@liveseller/contracts";
import {
  LIVESELLER_CODEX_REVIEW_TOOLS,
  buildCodexAppServerReviewTurn,
  executeCodexReviewToolCall,
  runCodexAppServerReviewSession
} from "../src/codexAppServerReview";
import { createJsonLineCodexAppServerTransport } from "../src/codexAppServerTransport";
import { createOperatorHttpServer } from "../src/server";

describe("Codex app-server operator review loop", () => {
  it("starts a Codex app-server review turn with LiveSeller domain tools", () => {
    const turn = buildCodexAppServerReviewTurn({
      cwd: "/repo/liveseller",
      threadId: "thread-review-001",
      reviewPlan: validProductReviewPlan,
      sellerText: "Make the title shorter and generate another image option."
    });

    expect(turn.threadStart.method).toBe("thread/start");
    expect(turn.threadStart.params.cwd).toBe("/repo/liveseller");
    expect(turn.threadStart.params.dynamicTools.map((tool) => tool.name)).toEqual(
      LIVESELLER_CODEX_REVIEW_TOOLS.map((tool) => tool.name)
    );
    expect(turn.turnStart.method).toBe("turn/start");
    expect(JSON.stringify(turn.turnStart.params.input)).toContain("ProductReviewPlan");
    expect(JSON.stringify(turn.turnStart.params.input)).toContain("Make the title shorter");
    expect(JSON.stringify(turn.turnStart.params.input)).toContain("liveseller_record_seller_review_response");
    expect(JSON.stringify(turn.turnStart.params.input)).toContain("liveseller_generate_image_edits");
    expect(JSON.stringify(turn.turnStart.params.input)).toContain("liveseller_run_generation_tasks");
  });

  it("executes Codex-selected review tools without publishing before approval", async () => {
    const updated = await executeCodexReviewToolCall(
      { reviewPlan: validProductReviewPlan, createProductCommands: [] },
      {
        tool: "liveseller_record_seller_review_response",
        arguments: {
          response: {
            ...validSellerFreeFormReviewResponse,
            text: "Make the title shorter and show another image option.",
            interpretedIntent: "edit_request"
          }
        }
      }
    );

    expect(updated.reviewPlan.items[0]?.reviewRounds).toHaveLength(2);
    expect(updated.createProductCommands).toEqual([]);
    expect(updated.contentItems[0]?.text).toContain("seller_review_required");
  });

  it("attaches generated image outputs through the app-server generation tool", async () => {
    const pendingTasks = validProductReviewPlan.generationTasks.filter((task) => task.status === "pending");

    const updated = await executeCodexReviewToolCall(
      { reviewPlan: validProductReviewPlan, createProductCommands: [] },
      {
        tool: "liveseller_run_generation_tasks",
        arguments: {
          completedAt: "2026-06-06T04:10:00.000Z",
          taskOutputs: pendingTasks.map((task) => ({
            taskId: task.taskId,
            outputRefs: [`generated/${task.taskId}.png`]
          }))
        }
      }
    );

    expect(updated.reviewPlan.generationTasks.filter((task) => task.taskType === "image_edit")).toEqual(
      pendingTasks.map((task) =>
        expect.objectContaining({
          taskId: task.taskId,
          status: "completed",
          outputRefs: [`generated/${task.taskId}.png`]
        })
      )
    );
    expect(updated.createProductCommands).toEqual([]);
  });

  it("runs configured image edit worker through the app-server image tool", async () => {
    const pendingTasks = validProductReviewPlan.generationTasks.filter((task) => task.status === "pending");
    const updated = await executeCodexReviewToolCall(
      { reviewPlan: validProductReviewPlan, createProductCommands: [] },
      {
        tool: "liveseller_generate_image_edits",
        arguments: {}
      },
      {
        imageEditRunner: async ({ reviewPlan }) => ({
          completedAt: "2026-06-06T04:12:00.000Z",
          taskOutputs: reviewPlan.generationTasks
            .filter((task) => task.status === "pending")
            .map((task) => ({
              taskId: task.taskId,
              outputRefs: [`generated/from-worker-${task.taskId}.png`]
            }))
        })
      }
    );

    expect(updated.reviewPlan.generationTasks.filter((task) => task.taskType === "image_edit")).toEqual(
      pendingTasks.map((task) =>
        expect.objectContaining({
          taskId: task.taskId,
          status: "completed",
          outputRefs: [`generated/from-worker-${task.taskId}.png`]
        })
      )
    );
    expect(updated.createProductCommands).toEqual([]);
  });

  it("rejects image edit tool calls when no worker is configured", async () => {
    await expect(executeCodexReviewToolCall(
      { reviewPlan: validProductReviewPlan, createProductCommands: [] },
      {
        tool: "liveseller_generate_image_edits",
        arguments: {}
      }
    )).rejects.toThrow("No image edit runner is configured");
  });

  it("emits create-product commands only after Codex records a seller approval decision", async () => {
    const approvedDecision: ProductReviewDecision = {
      decisionId: "decision-prod-cooling-tee-approved-by-codex-operator",
      productId: validProductReviewPlan.items[0]!.productId,
      status: "approved",
      decidedBy: "seller",
      decidedAt: "2026-06-06T04:15:00.000Z",
      reason: "Seller approved the reviewed draft in the Codex operator console.",
      citations: validProductReviewPlan.items[0]!.product.evidence
    };

    const approved = await executeCodexReviewToolCall(
      { reviewPlan: validProductReviewPlan, createProductCommands: [] },
      {
        tool: "liveseller_record_product_review_decision",
        arguments: { decision: approvedDecision }
      }
    );
    const published = await executeCodexReviewToolCall(approved, {
      tool: "liveseller_build_create_product_commands",
      arguments: {}
    });

    expect(published.reviewPlan.status).toBe("partially_approved");
    expect(published.createProductCommands).toHaveLength(1);
    expect(published.createProductCommands[0]).toMatchObject({
      kind: "create_product",
      approvalDecisionId: approvedDecision.decisionId,
      approvalStatus: "approved"
    });
  });

  it("runs a JSON-RPC app-server session and answers Codex tool-call events", async () => {
    const sent: unknown[] = [];
    const events = [
      {
        method: "item/tool/call",
        params: {
          callId: "call-record-response-001",
          tool: "liveseller_record_seller_review_response",
          arguments: {
            response: {
              ...validSellerFreeFormReviewResponse,
              text: "Shorter title please.",
              interpretedIntent: "edit_request"
            }
          }
        }
      },
      {
        method: "turn/completed",
        params: {
          reason: "tool_result_applied"
        }
      }
    ];

    const result = await runCodexAppServerReviewSession(
      {
        cwd: "/repo/liveseller",
        threadId: "thread-review-001",
        reviewPlan: validProductReviewPlan,
        sellerText: "Shorter title please."
      },
      {
        send: async (message) => {
          sent.push(message);
        },
        events: async function* () {
          for (const event of events) {
            yield event;
          }
        }
      }
    );

    expect(sent).toEqual([
      expect.objectContaining({ method: "initialize" }),
      expect.objectContaining({ method: "initialized" }),
      expect.objectContaining({ method: "thread/start" }),
      expect.objectContaining({ method: "turn/start" }),
      expect.objectContaining({
        result: expect.objectContaining({
          contentItems: expect.arrayContaining([expect.objectContaining({ type: "inputText" })]),
          success: true
        })
      })
    ]);
    expect(result.reviewPlan.items[0]?.reviewRounds).toHaveLength(2);
    expect(result.createProductCommands).toEqual([]);
    expect(result.operatorEvents.map((event) => event.type)).toEqual([
      "session_started",
      "tool_call_received",
      "tool_result_sent",
      "turn_completed"
    ]);
  });

  it("streams app-server JSON-RPC messages over stdio-compatible newline JSON", async () => {
    const { PassThrough } = await import("node:stream");
    const inbound = new PassThrough();
    const outbound = new PassThrough();
    const writes: string[] = [];
    outbound.on("data", (chunk) => writes.push(String(chunk)));

    const transport = createJsonLineCodexAppServerTransport({
      stdin: outbound,
      stdout: inbound
    });

    await transport.send({
      id: 7,
      method: "thread/start",
      params: {
        cwd: "/repo/liveseller"
      }
    });

    const events = transport.events()[Symbol.asyncIterator]();
    inbound.write(JSON.stringify({
      method: "item/tool/call",
      params: {
        callId: "call-stdio-001",
        tool: "liveseller_build_create_product_commands",
        arguments: {}
      }
    }) + "\n");

    await expect(events.next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        method: "item/tool/call",
        params: expect.objectContaining({
          callId: "call-stdio-001"
        })
      })
    });
    expect(writes.join("")).toBe('{"id":7,"method":"thread/start","params":{"cwd":"/repo/liveseller"}}\n');

    inbound.end();
    await expect(events.next()).resolves.toEqual({
      done: true,
      value: undefined
    });
  });

  it("serves extension-callable operator turns for plan edits and image outputs", async () => {
    const server = createOperatorHttpServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/operator/seller-review-turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewPlan: validProductReviewPlan,
          sellerText: "Make the title shorter and generate another background image option."
        })
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.interpretedCalls).toContain("liveseller_record_seller_review_response");
      expect(body.interpretedCalls).toContain("liveseller_apply_ai_draft_update");
      expect(body.interpretedCalls).toContain("liveseller_generate_image_edits");
      expect(body.reviewPlan.items[0].reviewRounds).toHaveLength(2);
      expect(body.reviewPlan.generationTasks.some((task: { outputRefs: string[] }) =>
        task.outputRefs.some((ref) => ref.startsWith("generated/operator-"))
      )).toBe(true);
      expect(body.createProductCommands).toEqual([]);
      expect(body.operatorEvents.map((event: { type: string }) => event.type)).toContain("turn_completed");

      const timelineResponse = await fetch(`http://127.0.0.1:${address.port}/api/operator/events`);
      expect(timelineResponse.status).toBe(200);
      const timeline = SellerTimelineResponseSchema.parse(await timelineResponse.json());
      expect(timeline.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            service: "operator",
            kind: "operator",
            title: expect.stringContaining("tool_call_received"),
            redacted: true
          }),
          expect.objectContaining({
            service: "operator",
            kind: "operator",
            status: "success",
            title: "turn_completed"
          })
        ])
      );
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("creates generated sidepanel-upload review drafts through the operator app-server", async () => {
    const server = createOperatorHttpServer({
      sidepanelDraftGenerator: async (input) => input.images.map((image, index) => ({
        imageIndex: index,
        title: index === 0 ? "Generated Jade Earrings" : "Generated Mosaic Brooch",
        category: "Fashion Accessories",
        price: index === 0 ? 18.8 : 28.8,
        stock: 12,
        description: `Generated seller-review listing from ${image.name}.`,
        bulletPoints: [`Visible product from ${image.name}`]
      }))
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address");
    }

    const product = {
      ...validProductReviewPlan.items[0]!.product,
      id: "sidepanel-upload-001",
      sku: "SIDE-001",
      title: "Uploaded product shell 1",
      sourceConfidence: 0.75
    };
    const secondProduct = {
      ...product,
      id: "sidepanel-upload-002",
      sku: "SIDE-002",
      title: "Uploaded product shell 2"
    };

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/operator/sidepanel-draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "live-sidepanel-upload-001",
          products: [product, secondProduct],
          images: [
            { name: "jade-earrings-front.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" },
            { name: "mosaic-brooch.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,BBBB" }
          ]
        })
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.reviewPlan).toMatchObject({
        sessionId: "live-sidepanel-upload-001",
        status: "seller_review_required",
        items: [
          expect.objectContaining({
            productId: "sidepanel-upload-001",
            product: expect.objectContaining({
              title: "Generated Jade Earrings",
              price: 18.8
            }),
            decision: expect.objectContaining({
              status: "pending"
            })
          }),
          expect.objectContaining({
            productId: "sidepanel-upload-002",
            product: expect.objectContaining({
              title: "Generated Mosaic Brooch",
              price: 28.8
            })
          })
        ]
      });
      expect(body.createProductCommands).toEqual([]);
      expect(body.operatorEvents.map((event: { type: string }) => event.type)).toContain("turn_completed");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("exposes create-product command building only after seller approval", async () => {
    const server = createOperatorHttpServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address");
    }
    const url = `http://127.0.0.1:${address.port}/api/operator/review-tools`;

    try {
      const blocked = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewPlan: validProductReviewPlan,
          calls: [{ tool: "liveseller_build_create_product_commands", arguments: {} }]
        })
      });
      expect(blocked.status).toBe(200);
      expect((await blocked.json()).createProductCommands).toEqual([]);

      const approvedDecision: ProductReviewDecision = {
        decisionId: "decision-http-approved",
        productId: validProductReviewPlan.items[0]!.productId,
        status: "approved",
        decidedBy: "seller",
        decidedAt: "2026-06-06T06:15:00.000Z",
        reason: "Seller approved from the extension operator bridge.",
        citations: validProductReviewPlan.items[0]!.product.evidence
      };
      const approved = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewPlan: validProductReviewPlan,
          calls: [
            {
              tool: "liveseller_record_product_review_decision",
              arguments: { decision: approvedDecision }
            },
            { tool: "liveseller_build_create_product_commands", arguments: {} }
          ]
        })
      });
      expect(approved.status).toBe(200);
      const body = await approved.json();
      expect(body.createProductCommands).toHaveLength(1);
      expect(body.createProductCommands[0]).toMatchObject({
        kind: "create_product",
        approvalDecisionId: approvedDecision.decisionId,
        approvalStatus: "approved"
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
