import { EventEmitter } from "node:events";
import pg from "pg";
import format from "pg-format";
import createSubscriber, { type Subscriber } from "pg-listen";
import { z } from "zod";
import { appConfig, getPgClientConfig } from "../../configuration/appConfig.js";
import type { StreamSubscriptionId } from "./pubsub.model";

const UpdatePayloadSchema = z.object({
  source: z.string(),
  data: z.string(),
  timestamp: z.number(),
});
type UpdatePayLoadType = z.infer<typeof UpdatePayloadSchema>;
type UpdateCallbackType = (payload: UpdatePayLoadType) => void;

export const DB_LISTEN_UPDATE_EVENT = "update";
const ASYNC_ITERABLE_PING_INTERVAL = 1000;

let _pool: pg.Pool | null = null;

function initDbEmit(dbUrl: string) {
  const pgConfigResult = getPgClientConfig(dbUrl);
  if (pgConfigResult.isErr()) {
    throw new Error("Unexpected error parsing dbUrl");
  }
  const { schema: ignored, ...pgConfig } = pgConfigResult.unwrap();
  _pool = new pg.Pool({ ...pgConfig, max: 20 });
}

export class DbListen extends EventEmitter {
  private updateCallback?: UpdateCallbackType | undefined;
  private closed = false;
  private subscriber: Subscriber<Record<string, unknown>>;

  constructor(
    private channel: string,
    private streamId: StreamSubscriptionId,
  ) {
    if (!_pool) {
      throw new Error("DbEmit not initialized. Please call initDbEmit first.");
    }
    super();
    const dbConfig = appConfig.get("db");

    const pgConfigResult = getPgClientConfig(dbConfig.url);
    if (pgConfigResult.isErr()) {
      throw new Error("Unexpected error parsing dbUrl");
    }
    const { schema: ignored, ...pgConfig } = pgConfigResult.unwrap();
    this.subscriber = createSubscriber(pgConfig);

    this.subscriber.notifications.on(this.channel, (raw) => {
      const payload = this.messageGuard(raw);

      if (payload) {
        this.emit(DB_LISTEN_UPDATE_EVENT, payload);
        this.updateCallback?.(payload);
      }
    });

    this.subscriber.events.on("error", (err) => {
      this.emit("error", err);
    });
  }

  async start() {
    if (this.closed) {
      throw new Error("Cannot start a closed DbListen");
    }

    await this.subscriber.connect();
    await this.subscriber.listenTo(this.channel);
  }

  setUpdateCallback(cb: UpdateCallbackType): void {
    this.updateCallback = cb;
  }

  private messageGuard(raw: unknown) {
    const payload = UpdatePayloadSchema.parse(raw);

    if (payload.source !== this.streamId) {
      return null;
    }
    return payload;
  }

  async close() {
    if (this.closed) {
      throw new Error("Cannot close an already closed DbListen");
    }
    this.closed = true;
    this.updateCallback = undefined;
    await this.subscriber.unlisten(this.channel);
    await this.subscriber.close();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<UpdatePayLoadType> {
    const messages: UpdatePayLoadType[] = [];

    let waiting: (() => void) | null = null;
    const onMessage = (raw: unknown) => {
      const payload = this.messageGuard(raw);

      if (payload) {
        messages.push(payload);
        if (waiting) {
          waiting();
          waiting = null;
        }
      }
    };
    this.subscriber.notifications.on(this.channel, onMessage);

    try {
      while (!this.closed) {
        if (messages.length === 0) {
          await new Promise<void>((resolve) => {
            waiting = resolve;
            setTimeout(resolve, ASYNC_ITERABLE_PING_INTERVAL);
          });
        }
        while (messages.length > 0) {
          const message = messages.shift();
          if (!message) {
            throw new Error("Unexpected null message");
          }
          yield message;
        }
      }
    } finally {
      this.subscriber.notifications.removeListener(this.channel, onMessage);
    }
  }
}

async function publish({
  channelName,
  streamId,
  message,
}: { channelName: string; streamId: StreamSubscriptionId; message: string }) {
  if (!_pool) {
    throw new Error("DbEmit not initialized. Please call initDbEmit first.");
  }

  try {
    const serialized = JSON.stringify({
      source: streamId,
      data: message,
      timestamp: new Date().getTime(),
    });
    const client = await _pool.connect();

    await client.query(
      `NOTIFY ${format.ident(channelName)}, ${format.literal(serialized)}`,
    );
    client.release();
    return true;
  } catch (err) {
    console.error("Error publishing message:", err);
    return false;
  }
}
export const DbEmit = {
  initDbEmit,
  publish,
};
