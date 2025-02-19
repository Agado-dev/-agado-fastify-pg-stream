import { appApiContract } from "@agado/api-starter-contract";
import type { RouterImplementation } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import type { TsRestFastifyServerType } from "../infrastructure/ts-rest/ts-rest.plugin.js";
import { createAssetsRouter } from "./assets/assets.router.js";
import { realtimeRoutes } from "./realtime/realtime.api.js";

export function createAppRouter(
  tsRestServer: TsRestFastifyServerType,
): RouterImplementation<typeof appApiContract> {
  return tsRestServer.router(appApiContract, {
    assets: createAssetsRouter(tsRestServer),
  });
}

export async function apiRouter(fastify: FastifyInstance) {
  await fastify.register(realtimeRoutes, { prefix: "/realtime" });
}
