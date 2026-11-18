import { HttpProbe } from "../probes/types.js";
import { Observation } from "../observations/types.js";
import { AuthProfile } from "../auth/types.js";
import { ReliabilityConfig } from "../reliability/types.js";

export interface AdapterExecutionOptions {
  authProfile?: AuthProfile;
  reliability?: ReliabilityConfig;
}

export interface AppAdapter {
  name: string;
  isApplicable(framework: string): boolean;
  executeProbes(
    appRoot: string,
    entrypoint: string,
    exportName: string,
    probes: HttpProbe[],
    timeoutMs: number,
    revisionRef: string,
    options?: AdapterExecutionOptions
  ): Promise<Observation[]>;
}
