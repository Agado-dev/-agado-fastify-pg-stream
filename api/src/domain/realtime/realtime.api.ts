import type { FastifyInstance } from "fastify";
import { appConfig } from "../../infrastructure/configuration/appConfig.js";
import { DbListen, DbEmit } from "../../infrastructure/db/pubsub/db-listen.js";

export function realtimeRoutes(fastify: FastifyInstance) {
	const dbConfig = appConfig.get("db");
	DbEmit.initDbEmit(dbConfig.url);

	fastify.get<{
		Params: { streamId: string };
	}>("/:streamId", {
		schema: {
			params: {
				type: "object",
				properties: {
					streamId: { type: "string" },
				},
				required: ["streamId"],
			},
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
		Body: { message: string };
	}>("/", {
		schema: {
			body: {
				type: "object",
				properties: {
					message: { type: "string" },
				},
				required: ["message"],
			},
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
