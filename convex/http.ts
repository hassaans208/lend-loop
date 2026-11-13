import { httpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "./lib/signature";
import { AUTOMATION_EVENT_STATUSES, AUTOMATION_EVENT_TYPES } from "./lib/validators";

/**
 * n8n -> Convex HTTP endpoints. Every route:
 *  1. caps the body size,
 *  2. verifies the HMAC signature over the *raw* body (before parsing JSON),
 *  3. validates the JSON shape with zod,
 *  4. delegates to an internal function (not callable from the public client).
 */

const MAX_BODY_BYTES = 16 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type SignedHandler<T> = (ctx: ActionCtx, body: T) => Promise<Response>;

function signedRoute<T>(schema: z.ZodType<T>, handler: SignedHandler<T>) {
  return httpAction(async (ctx, request) => {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) return json(413, { error: "Payload too large" });
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return json(413, { error: "Payload too large" });

    const verification = await verifySignature({
      secret: process.env.LENDLOOP_WEBHOOK_SECRET,
      rawBody,
      signatureHeader: request.headers.get(SIGNATURE_HEADER),
      timestampHeader: request.headers.get(TIMESTAMP_HEADER),
      nowSeconds: Date.now() / 1000,
    });
    if (!verification.ok) {
      // Log the precise reason for operators; tell the caller nothing useful.
      console.warn(`[http] rejected ${new URL(request.url).pathname}: ${verification.reason}`);
      return json(401, { error: "Invalid signature" });
    }

    let parsedJson: unknown;
    try {
      parsedJson = rawBody.length ? JSON.parse(rawBody) : {};
    } catch {
      return json(400, { error: "Body must be JSON" });
    }
    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      return json(400, { error: "Invalid body", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    return handler(ctx, parsed.data);
  });
}

const eventSchema = z.object({
  idempotencyKey: z.string().min(1).max(120),
  loanId: z.string().min(1).max(64),
  type: z.enum(AUTOMATION_EVENT_TYPES),
  status: z.enum(AUTOMATION_EVENT_STATUSES),
  runId: z.string().min(1).max(120),
  error: z.string().max(2000).optional(),
});

const failureSchema = z.object({
  workflowName: z.string().min(1).max(200),
  executionId: z.string().min(1).max(64),
  lastNode: z.string().max(200).optional(),
  message: z.string().min(1).max(4000),
});

const http = httpRouter();

/** Daily overdue workflow: "which borrowers need a reminder today?" */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: signedRoute(z.object({}).passthrough(), async (ctx) => {
    const result = await ctx.runQuery(internal.automation.overdueLoans, {});
    return json(200, result);
  }),
});

/** Write-back of a sent / failed notification or reminder. Idempotent by key. */
http.route({
  path: "/n8n/events",
  method: "POST",
  handler: signedRoute(eventSchema, async (ctx, body) => {
    const result = await ctx.runMutation(internal.automation.recordEventFromWebhook, body);
    if (!result.ok) return json(422, { error: result.reason });
    return json(200, { ok: true, decision: result.decision });
  }),
});

/** n8n Error Workflow: a whole execution failed (e.g. Convex or SMTP unreachable). */
http.route({
  path: "/n8n/workflow-failures",
  method: "POST",
  handler: signedRoute(failureSchema, async (ctx, body) => {
    const result = await ctx.runMutation(internal.automation.recordWorkflowFailure, body);
    return json(200, { ok: true, decision: result.decision });
  }),
});

export default http;
