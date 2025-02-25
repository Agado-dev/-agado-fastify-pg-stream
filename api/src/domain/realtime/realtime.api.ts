import {
  GetStreamParamsJsonSchema,
  type GetStreamParamsType,
  PostStreamBodyJsonSchema,
  type PostStreamBodyType,
} from "@agado/api-starter-contract";
import type { FastifyInstance } from "fastify";
import { appConfig } from "../../infrastructure/configuration/appConfig.js";
import { DbEmit, DbListen } from "../../infrastructure/db/pubsub/db-listen.js";

export function realtimeRoutes(fastify: FastifyInstance) {
  const dbConfig = appConfig.get("db");
  DbEmit.initDbEmit(dbConfig.url);

  fastify.get<{
    Params: GetStreamParamsType;
  }>("/:streamId", {
    schema: {
      params: GetStreamParamsJsonSchema,
    },
    handler: async (request, reply) => {
      const authenticatedUser = { sub: "userId" };
      const dbListener = new DbListen(
        "stream-channel",
        `${authenticatedUser.sub}-${request.params.streamId}`,
      );
      await dbListener.start();
      reply.sse(dbListener);
    },
  });
  fastify.post<{
    Body: PostStreamBodyType;
  }>("/", {
    schema: {
      body: PostStreamBodyJsonSchema,
      response: {
        201: {
          description: "Posted message",
        },
      },
    },

    handler: async (request, reply) => {
      const authenticatedUser = { sub: "userId" };
      await DbEmit.publish({
        channelName: "stream-channel",
        streamId: `${authenticatedUser.sub}-streamId`,
        message: request.body.message,
      });

      reply.status(201).send();
    },
  });

  return fastify;
}
