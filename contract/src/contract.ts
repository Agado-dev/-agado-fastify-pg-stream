import { initContract } from "@ts-rest/core";
import { publicAssetContract } from "./publicAssets/publicAssets.contract";

const tsRestContract = initContract();

export const appApiContract = tsRestContract.router({
  assets: publicAssetContract,
});

/** FOO **/

/** ASSETS **/
export * from "./publicAssets/publicAssets.contract";

/** ERROR **/
export * from "./error/error.model";
