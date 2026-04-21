import type { Store } from "../../store/store";
import type { Config } from "../../config";

export type Ctx = {
  store: Store;
  config: Config;
  deviceId: string;
  skipICloudCheckOnDownload?: boolean;
};
