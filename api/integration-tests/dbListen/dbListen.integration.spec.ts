import { on } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { appConfig } from "../../src/infrastructure/configuration/appConfig.js";

import {
	DB_LISTEN_UPDATE_EVENT,
	DbListen,
	DbEmit,
} from "../../src/infrastructure/db/pubsub/db-listen.js";
import { IntegrationTestContext } from "../integrationTestContext.js";

describe("authentication", () => {
	const integrationTestContext = new IntegrationTestContext();

	beforeAll(async () => {
		await integrationTestContext.start();
		const dbConfig = appConfig.get("db");
		DbEmit.initDbEmit(dbConfig.url);
	});

	it("should NOT reveive update message from other StreamSubscriptionId", async () => {
		const listenCallback = vi.fn(() => {
			throw new Error("Callback should not have been called");
		});

		const dbListenerA = new DbListen("stream-channel", "userA-streamId").on(
			DB_LISTEN_UPDATE_EVENT,
			listenCallback,
		);
		await dbListenerA.start();

		const dbListenerB = new DbListen("stream-channel", "userB-streamId");
		await dbListenerB.start();

		await DbEmit.publish({
			channelName: "stream-channel",
			streamId: "userB-streamId",
			message: "an update occured",
		});

		await sleep(100);

		expect(listenCallback).not.toHaveBeenCalled();
		dbListenerA.close();
		dbListenerB.close();
	}, 1_000); // 1s timeout should be enough to receive the event

	it("should reveive update event message on the same StreamSubscriptionId", async () => {
		const listenCallback = vi.fn((data: string) => {
			console.log("Callback called with:", data);
		});

		const dbListener = new DbListen("stream-channel", "userId-streamId").on(
			DB_LISTEN_UPDATE_EVENT,
			(event) => listenCallback(event.data),
		);
		await dbListener.start();

		await DbEmit.publish({
			channelName: "stream-channel",
			streamId: "userId-streamId",
			message: "an update occured",
		});

		await sleep(100);
		expect(listenCallback).toHaveBeenCalledWith("an update occured");
	}, 1_000); // 1s timeout should be enough to receive the event

	it("should trigger registered updateCallback", async () => {
		const updateCallback = vi.fn((data: string) => {});

		const dbListener = new DbListen("stream-channel", "userId-streamId");
		dbListener.setUpdateCallback((event) => updateCallback(event.data));
		await dbListener.start();

		await DbEmit.publish({
			channelName: "stream-channel",
			streamId: "userId-streamId",
			message: "an update occured in callback",
		});

		await sleep(100);
		expect(updateCallback).toHaveBeenCalledTimes(1);
		expect(updateCallback).toHaveBeenCalledWith(
			"an update occured in callback",
		);
	}, 1_000); // 1s timeout should be enough to receive the event

	it("should reveive multiple messages on the same dbListener", async () => {
		const listenCallback = vi.fn((event: { data: string }) => {
			console.log("Callback called with:", event.data);
		});

		const dbListener = new DbListen("stream-channel", "userId-streamId").on(
			DB_LISTEN_UPDATE_EVENT,
			listenCallback,
		);
		await dbListener.start();

		await Promise.all([
			DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userId-streamId",
				message: "update 1 occured",
			}),
			DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userId-streamId",
				message: "update 2 occured",
			}),
			DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userId-streamId",
				message: "update 3 occured",
			}),
		]);

		await sleep(100);

		expect(listenCallback).toBeCalledTimes(3);
		dbListener.close();
	}, 1_000); // 1s timeout should be enough to receive the event

	it("should reveive multiple messages on the different dbListeners with same StreamSubscriptionId", async () => {
		const listenCallback = vi.fn((event: { data: string }) => {
			console.log("Callback called with:", event.data);
		});

		const dbListenerA = new DbListen("stream-channel", "userA-streamId");
		await dbListenerA.start();

		const dbListenerB = new DbListen("stream-channel", "userA-streamId").on(
			DB_LISTEN_UPDATE_EVENT,
			listenCallback,
		);
		await dbListenerB.start();

		await Promise.all([
			DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userA-streamId",
				message: "update 1 occured",
			}),
			DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userA-streamId",
				message: "update 2 occured",
			}),
			DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userA-streamId",
				message: "update 3 occured",
			}),
		]);

		await sleep(500);

		expect(listenCallback).toBeCalledTimes(3);
		dbListenerA.close();
		dbListenerB.close();
	}, 1_000); // 1s timeout should be enough to receive the event

	it("should NOT receive update message after the dbListener has been closed", async () => {
		const listenCallback = vi.fn(() => {
			throw new Error("Callback should not have been called after close");
		});

		const dbListener = new DbListen(
			"stream-channel",
			"usertest-closestream",
		).on(DB_LISTEN_UPDATE_EVENT, listenCallback);
		await dbListener.start();

		// Close immediately
		await dbListener.close();

		// Attempt to update after closing, callback should not be triggered.
		await DbEmit.publish({
			channelName: "stream-channel",
			streamId: "usertest-closestream",
			message: "message after close",
		});

		await sleep(100);

		expect(listenCallback).not.toHaveBeenCalled();
	}, 1_000); // 1s timeout should be enough to receive the event

	it("should deliver updates only to the active listener among multiple listeners sharing same subscription id", async () => {
		const activeCallback = vi.fn((event: { data: string }) => {
			expect(event.data).toMatch(/update/);
		});
		const inactiveCallback = vi.fn(() => {
			throw new Error("Inactive listener should not be triggered");
		});

		// Set up two listeners for the same channel and subscription id
		const activeListener = new DbListen("stream-channel", "usertest-active").on(
			DB_LISTEN_UPDATE_EVENT,
			activeCallback,
		);
		await activeListener.start();

		const inactiveListener = new DbListen(
			"stream-channel",
			"usertest-stream",
		).on(DB_LISTEN_UPDATE_EVENT, inactiveCallback);

		// Close the inactive listener immediately so it does not listen
		await inactiveListener.close();

		const isUpdateSent = await DbEmit.publish({
			channelName: "stream-channel",
			streamId: "usertest-active",
			message: "update for active listener",
		});
		expect(isUpdateSent).toBe(true);

		await sleep(100);

		expect(activeCallback).toHaveBeenCalledTimes(1);
		expect(inactiveCallback).not.toHaveBeenCalled();
		await activeListener.close();
	}, 1_000); // 1s timeout should be enough to receive the event

	it("should allow reinitializing and receiving updates after a listener is closed", async () => {
		const firstCallback = vi.fn(() => {
			// First listener should get one update then close
		});
		const secondCallback = vi.fn((event: { data: string }) => {
			expect(event.data).toBe("second update");
		});

		// First listener
		const firstListener = new DbListen("stream-channel", "reinit-stream").on(
			DB_LISTEN_UPDATE_EVENT,
			firstCallback,
		);
		await firstListener.start();

		await DbEmit.publish({
			channelName: "stream-channel",
			streamId: "reinit-stream",
			message: "first update",
		});
		await sleep(100);

		expect(firstCallback).toHaveBeenCalledTimes(1);
		await firstListener.close();

		// Reinitialize a new listener on the same channel & subscription id
		const secondListener = new DbListen("stream-channel", "reinit-stream").on(
			DB_LISTEN_UPDATE_EVENT,
			secondCallback,
		);
		await secondListener.start();

		await DbEmit.publish({
			channelName: "stream-channel",
			streamId: "reinit-stream",
			message: "second update",
		});
		await sleep(100);
		expect(secondCallback).toHaveBeenCalledTimes(1);
		secondListener.close();
	}, 1_000); // 1s timeout should be enough to receive the event

	it("should allow to be used as an ayncIterable", async () => {
		const dbListener = new DbListen("stream-channel", "userA-stream");
		await dbListener.start();

		async function emitMessagesSeq() {
			// A function that await each message emission to ensure order
			await DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userA-stream",
				message: "update 1 occured",
			});
			await DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userA-stream",
				message: "update 2 occured",
			});
			await DbEmit.publish({
				channelName: "stream-channel",
				streamId: "userA-stream",
				message: "update 3 occured",
			});
		}
		emitMessagesSeq();
		setTimeout(() => {
			dbListener.close();
		}, 100);

		const results: string[] = [];
		for await (const event of dbListener) {
			results.push(event.data);
		}
		expect(results).toEqual([
			"update 1 occured",
			"update 2 occured",
			"update 3 occured",
		]);
	});

	it("should allow to use both ayncIterable and eventListener", async () => {
		const listenCallback = vi.fn((event: { data: string }) => {
			console.log("Callback called with:", event.data);
		});

		const dbListener = new DbListen("stream-channel", "userA-stream").on(
			DB_LISTEN_UPDATE_EVENT,
			listenCallback,
		);
		await dbListener.start();

		DbEmit.publish({
			channelName: "stream-channel",
			streamId: "userA-stream",
			message: "update 1 occured",
		});
		DbEmit.publish({
			channelName: "stream-channel",
			streamId: "userA-stream",
			message: "update 2 occured",
		});
		DbEmit.publish({
			channelName: "stream-channel",
			streamId: "userA-stream",
			message: "update 3 occured",
		});

		setTimeout(() => {
			dbListener.close();
		}, 100);

		const results: string[] = [];
		for await (const event of dbListener) {
			results.push(event.data);
		}
		expect(results).toEqual([
			"update 1 occured",
			"update 2 occured",
			"update 3 occured",
		]);
		expect(listenCallback).toBeCalledTimes(3);
	});
});
