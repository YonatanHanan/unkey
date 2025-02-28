import { describe, expect, test } from "vitest";

import { randomUUID } from "crypto";
import { schema } from "@unkey/db";
import { newId } from "@unkey/id";
import { RouteHarness } from "../pkg/testutil/route-harness";
import { V1RatelimitLimitRequest, V1RatelimitLimitResponse } from "./v1_ratelimit_limit";

describe("without override", () => {
  test("should use the hardcoded limit", async (t) => {
    const h = await RouteHarness.init(t);
    const namespace = {
      id: newId("test"),
      workspaceId: h.resources.userWorkspace.id,
      createdAt: new Date(),
      name: "namespace",
    };
    await h.db.insert(schema.ratelimitNamespaces).values(namespace);

    const identifier = randomUUID();

    const root = await h.createRootKey(["ratelimit.*.limit"]);

    const limit = 10;
    const duration = 60_000;
    const res = await h.post<V1RatelimitLimitRequest, V1RatelimitLimitResponse>({
      url: "/v1/ratelimits.limit",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${root.key}`,
      },
      body: {
        identifier,
        namespace: namespace.name,
        limit,
        duration,
      },
    });

    expect(res.status).toEqual(200);
    expect(res.body.limit).toEqual(limit);
  });
});

describe("with serverside override", () => {
  test("should use the override limit", async (t) => {
    const h = await RouteHarness.init(t);
    const namespace = {
      id: newId("test"),
      workspaceId: h.resources.userWorkspace.id,
      createdAt: new Date(),
      name: "namespace",
    };
    await h.db.insert(schema.ratelimitNamespaces).values(namespace);

    const identifier = randomUUID();

    const root = await h.createRootKey(["ratelimit.*.limit"]);

    const limit = 10;
    const overrideLimit = 20;
    const duration = 60_000;

    await h.db.insert(schema.ratelimitOverrides).values({
      id: newId("ratelimitOverride"),
      identifier,
      createdAt: new Date(),
      limit: overrideLimit,
      duration,
      namespaceId: namespace.id,
      workspaceId: namespace.workspaceId,
    });

    const res = await h.post<V1RatelimitLimitRequest, V1RatelimitLimitResponse>({
      url: "/v1/ratelimits.limit",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${root.key}`,
      },
      body: {
        identifier,
        namespace: namespace.name,
        limit,
        duration,
      },
    });
    expect(res.status).toEqual(200);
    expect(res.body.limit).toEqual(overrideLimit);
  });
});
