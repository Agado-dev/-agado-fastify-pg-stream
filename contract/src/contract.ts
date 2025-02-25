import { initContract } from "@ts-rest/core";
import { publicAssetContract } from "./publicAssets/publicAssets.contract";

const tsRestContract = initContract();

export const appApiContract = tsRestContract.router({
  assets: publicAssetContract,
});

/** REALTIME **/
export * from "./realtime/realtime.model";

/** ASSETS **/
export * from "./publicAssets/publicAssets.contract";

/** ERROR **/
export * from "./error/error.model";
