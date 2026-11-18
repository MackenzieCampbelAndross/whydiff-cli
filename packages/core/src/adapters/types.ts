import { HttpProbe } from "../probes/types.js";
import { Observation } from "../observations/types.js";

export interface AppAdapter {
  name: string;
  isApplicable(framework: string): boolean;
  executeProbes(
    appRoot: string,
    entrypoint: string,
    exportName: string,
    probes: HttpProbe[],
    timeoutMs: number,
    revisionRef: string
  ): Promise<Observation[]>;
}
