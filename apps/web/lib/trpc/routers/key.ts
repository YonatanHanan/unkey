import { Permission, db, eq, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { ingestAuditLogs } from "@/lib/tinybird";
import { TRPCError } from "@trpc/server";
import { newId } from "@unkey/id";
import { newKey } from "@unkey/keys";
import { unkeyPermissionValidation } from "@unkey/rbac";
import { z } from "zod";
import { auth, t } from "../trpc";
import { upsertPermission } from "./rbac";

export const keyRouter = t.router({
  create: t.procedure
    .use(auth)
    .input(
      z.object({
        prefix: z.string().optional(),
        bytes: z.number().int().gte(1).default(16),
        keyAuthId: z.string(),
        ownerId: z.string().nullish(),
        meta: z.record(z.unknown()).optional(),
        remaining: z.number().int().positive().optional(),
        refill: z
          .object({
            interval: z.enum(["daily", "monthly"]),
            amount: z.coerce.number().int().min(1),
          })
          .optional(),
        expires: z.number().int().nullish(), // unix timestamp in milliseconds
        name: z.string().optional(),
        ratelimit: z
          .object({
            type: z.enum(["consistent", "fast"]),
            refillInterval: z.number().int().positive(),
            refillRate: z.number().int().positive(),
            limit: z.number().int().positive(),
          })
          .optional(),
        enabled: z.boolean().default(true),
        environment: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const workspace = await db.query.workspaces.findFirst({
        where: (table, { and, eq, isNull }) =>
          and(eq(table.tenantId, ctx.tenant.id), isNull(table.deletedAt)),
      });
      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "workspace not found",
        });
      }

      const keyAuth = await db.query.keyAuth.findFirst({
        where: (table, { eq }) => eq(table.id, input.keyAuthId),
        with: {
          api: true,
        },
      });
      if (!keyAuth) {
        throw new TRPCError({ code: "NOT_FOUND", message: "keyAuth not found" });
      }

      const keyId = newId("key");
      const { key, hash, start } = await newKey({
        prefix: input.prefix,
        byteLength: input.bytes,
      });

      await db.insert(schema.keys).values({
        id: keyId,
        keyAuthId: keyAuth.id,
        name: input.name,
        hash,
        start,
        ownerId: input.ownerId,
        meta: JSON.stringify(input.meta ?? {}),
        workspaceId: workspace.id,
        forWorkspaceId: null,
        expires: input.expires ? new Date(input.expires) : null,
        createdAt: new Date(),
        ratelimitLimit: input.ratelimit?.limit,
        ratelimitRefillRate: input.ratelimit?.refillRate,
        ratelimitRefillInterval: input.ratelimit?.refillInterval,
        ratelimitType: input.ratelimit?.type,
        remaining: input.remaining,
        refillInterval: input.refill?.interval ?? null,
        refillAmount: input.refill?.amount ?? null,
        lastRefillAt: input.refill?.interval ? new Date() : null,
        deletedAt: null,
        enabled: input.enabled,
        environment: input.environment,
      });

      await ingestAuditLogs({
        workspaceId: workspace.id,
        actor: { type: "user", id: ctx.user.id },
        event: "key.create",
        description: `Created ${keyId}`,
        resources: [
          {
            type: "key",
            id: keyId,
          },
        ],
        context: {
          location: ctx.audit.location,
          userAgent: ctx.audit.userAgent,
        },
      });

      return { keyId, key };
    }),
  createInternalRootKey: t.procedure
    .use(auth)
    .input(
      z.object({
        name: z.string().optional(),
        permissions: z.array(unkeyPermissionValidation).min(1, {
          message: "You must add at least 1 permissions",
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const unkeyApi = await db.query.apis.findFirst({
        where: eq(schema.apis.id, env().UNKEY_API_ID),
        with: {
          workspace: true,
        },
      });
      if (!unkeyApi) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `api ${env().UNKEY_API_ID} not found`,
        });
      }
      if (!unkeyApi.keyAuthId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `api ${env().UNKEY_API_ID} is not setup to handle keys`,
        });
      }

      const workspace = await db.query.workspaces.findFirst({
        where: (table, { and, eq, isNull }) =>
          and(eq(table.tenantId, ctx.tenant.id), isNull(table.deletedAt)),
        with: {
          apis: {
            columns: {
              id: true,
            },
          },
        },
      });
      if (!workspace) {
        console.error(`workspace for tenant ${ctx.tenant.id} not found`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "workspace not found",
        });
      }

      const keyId = newId("key");

      const { key, hash, start } = await newKey({
        prefix: "unkey",
        byteLength: 16,
      });

      await db.transaction(async (tx) => {
        await tx.insert(schema.keys).values({
          id: keyId,
          keyAuthId: unkeyApi.keyAuthId!,
          name: input?.name,
          hash,
          start,
          ownerId: ctx.user.id,
          workspaceId: env().UNKEY_WORKSPACE_ID,
          forWorkspaceId: workspace.id,
          expires: null,
          createdAt: new Date(),
          remaining: null,
          refillInterval: null,
          refillAmount: null,
          lastRefillAt: null,
          deletedAt: null,
          enabled: true,
        });
        await ingestAuditLogs({
          workspaceId: workspace.id,
          actor: { type: "user", id: ctx.user.id },
          event: "key.create",
          description: `Created ${keyId}`,
          resources: [
            {
              type: "key",
              id: keyId,
            },
          ],
          context: {
            location: ctx.audit.location,
            userAgent: ctx.audit.userAgent,
          },
        });

        const permissions: Permission[] = [];
        for (const name of input.permissions) {
          permissions.push(await upsertPermission(ctx, env().UNKEY_WORKSPACE_ID, name));
        }

        await tx.insert(schema.keysPermissions).values(
          permissions.map((p) => ({
            keyId,
            permissionId: p.id,
            workspaceId: env().UNKEY_WORKSPACE_ID,
          })),
        );
        await ingestAuditLogs(
          permissions.map((p) => ({
            workspaceId: workspace.id,
            actor: { type: "user", id: ctx.user.id },
            event: "authorization.connect_permission_and_key",
            description: `Connected ${p.id} and ${keyId}`,
            resources: [
              {
                type: "key",
                id: keyId,
              },
              {
                type: "permission",
                id: p.id,
              },
            ],
            context: {
              location: ctx.audit.location,
              userAgent: ctx.audit.userAgent,
            },
          })),
        );
      });

      return { key, keyId };
    }),
  delete: t.procedure
    .use(auth)
    .input(
      z.object({
        keyIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await db.query.workspaces.findFirst({
        where: (table, { and, eq, isNull }) =>
          and(eq(table.tenantId, ctx.tenant.id), isNull(table.deletedAt)),
      });
      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "workspace not found",
        });
      }

      await Promise.all(
        input.keyIds.map(async (keyId) => {
          const key = await db.query.keys.findFirst({
            where: (table, { eq, and }) =>
              and(eq(table.id, keyId), eq(table.workspaceId, workspace.id)),
            with: {
              keyAuth: {
                with: {
                  api: true,
                },
              },
            },
          });
          if (!key) {
            console.warn(`key ${keyId} not found, skipping deletion`);
            return;
          }
          if (key.deletedAt !== null) {
            console.warn(`key ${keyId} already deleted, skipping deletion`);
            return;
          }
          await db
            .update(schema.keys)
            .set({
              deletedAt: new Date(),
            })
            .where(eq(schema.keys.id, keyId));
          await ingestAuditLogs({
            workspaceId: workspace.id,
            actor: { type: "user", id: ctx.user.id },
            event: "key.delete",
            description: `Deleted ${keyId}`,
            resources: [
              {
                type: "key",
                id: keyId,
              },
            ],
            context: {
              location: ctx.audit.location,
              userAgent: ctx.audit.userAgent,
            },
          });
        }),
      );
      return;
    }),
  deleteRootKey: t.procedure
    .use(auth)
    .input(
      z.object({
        keyIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await db.query.workspaces.findFirst({
        where: (table, { and, eq, isNull }) =>
          and(eq(table.tenantId, ctx.tenant.id), isNull(table.deletedAt)),
      });
      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "workspace not found",
        });
      }

      await Promise.all(
        input.keyIds.map(async (keyId) => {
          const key = await db.query.keys.findFirst({
            where: (table, { eq, and }) =>
              and(eq(table.id, keyId), eq(table.forWorkspaceId, workspace.id)),
          });
          if (!key) {
            console.warn(`key ${keyId} not found, skipping deletion`);
            return;
          }
          if (key.deletedAt !== null) {
            console.warn(`key ${keyId} already deleted, skipping deletion`);
            return;
          }
          await db
            .update(schema.keys)
            .set({
              deletedAt: new Date(),
            })
            .where(eq(schema.keys.id, keyId));
        }),
      );
      return;
    }),
});
