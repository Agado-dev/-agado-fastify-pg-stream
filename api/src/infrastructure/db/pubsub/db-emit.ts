import pg from "pg";
import format from "pg-format";
import { getPgClientConfig } from "../../configuration/appConfig.js";
import type { StreamSubscriptionId } from "./pubsub.model";

let _pool: pg.Pool | null = null;

function initDbEmit(dbUrl: string) {
  const pgConfigResult = getPgClientConfig(dbUrl);
  if (pgConfigResult.isErr()) {
    throw new Error("Unexpected error parsing dbUrl");
  }
  const { schema: ignored, ...pgConfig } = pgConfigResult.unwrap();
  _pool = new pg.Pool({ ...pgConfig, max: 20 });
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

export const DbEmits = {
  initDbEmit,
  publish,
};
