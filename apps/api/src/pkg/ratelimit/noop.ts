import { Ok, Result } from "@unkey/error";
import { Context } from "hono";
import { RateLimiter, RatelimitError, RatelimitRequest, RatelimitResponse } from "./interface";

export class NoopRateLimiter implements RateLimiter {
  public async limit(
    _c: Context,
    req: RatelimitRequest,
  ): Promise<Result<RatelimitResponse, RatelimitError>> {
    console.log("noop limit", req);
    return Ok({ current: 0, pass: true, reset: 0 });
  }
}
