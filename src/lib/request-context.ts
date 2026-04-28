/**
 * Request correlation ID accessor for Node-runtime server code.
 *
 * Middleware (edge runtime) generates a UUID per request and forwards it
 * as an `x-request-id` header on both the rewritten request and the
 * outgoing response. Route handlers, server actions, and server
 * components running in the Node runtime can read it here to include
 * in log context, so a single user-visible failure is greppable across
 * every downstream log line it triggered.
 *
 * Callers should treat a missing ID as "log without correlation" rather
 * than synthesizing a fresh one — minting a second ID inside the route
 * would break the very property we're after.
 */
import { headers } from "next/headers";

export async function getRequestId(): Promise<string | undefined> {
  try {
    const id = (await headers()).get("x-request-id");
    return id && id.length > 0 ? id : undefined;
  } catch {
    // `headers()` throws when called outside a request scope (tests,
    // module init). Returning undefined lets the caller log without a
    // request id instead of crashing.
    return undefined;
  }
}
