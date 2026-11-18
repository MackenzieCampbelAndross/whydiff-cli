import { Observation } from "../observations/types.js";
import { ValueDifference } from "../comparison/types.js";

export type DeltaSeverity = "breaking" | "risky" | "changed" | "informational";

export interface AffectedCodeLocation {
  file: string;
  line?: number;
}

export interface BehavioralDelta {
  id: string;
  title: string;
  severity: DeltaSeverity;
  confidence: number;
  surface: Array<"http">;
  before: Observation;
  after: Observation;
  differences: ValueDifference[];
  evidence: string[];
  affectedCode: AffectedCodeLocation[];
  createdAt: string;
}
