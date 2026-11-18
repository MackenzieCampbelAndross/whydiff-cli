import { Observation } from "../observations/types.js";
import { BehavioralDelta } from "../classification/types.js";
import { ContractDiffResult } from "../openapi/types.js";

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
    unverifiedCount?: number;
    retriedProbes?: number;
  };
  contractDiff?: ContractDiffResult;
  authProfilesUsed?: {
    baseline?: string;
    candidate?: string;
  };
}

export interface RunReport {
  metadata: RunMetadata;
  deltas: BehavioralDelta[];
  baselineObservations: Observation[];
  candidateObservations: Observation[];
  contractDiff?: ContractDiffResult;
}
