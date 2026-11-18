import { Observation } from "../observations/types.js";
import { BehavioralDelta, DeltaSeverity } from "../classification/types.js";

export interface RunMetadata {
  runId: string;
  version: string;
  nodeVersion: string;
  timestamp: string;
  durationMs: number;
  project: {
    name: string;
    framework: string;
  };
  baseline: {
    ref: string;
    sha: string;
  };
  candidate: {
    ref: string;
    sha: string;
  };
  statistics: {
    probeCount: number;
    successfulProbes: number;
    failedProbes: number;
    deltaCount: number;
    breakingCount: number;
    riskyCount: number;
    changedCount: number;
    informationalCount: number;
  };
}

export interface RunReport {
  metadata: RunMetadata;
  deltas: BehavioralDelta[];
  baselineObservations: Observation[];
  candidateObservations: Observation[];
}
