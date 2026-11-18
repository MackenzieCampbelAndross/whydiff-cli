export type DifferenceKind =
  | "added"
  | "removed"
  | "changed"
  | "type_changed"
  | "status_changed"
  | "header_changed"
  | "execution_failed";

export interface ValueDifference {
  path: string;
  kind: DifferenceKind;
  beforeValue?: unknown;
  afterValue?: unknown;
  description?: string;
}

export interface ComparisonResult {
  probeId: string;
  hasDifferences: boolean;
  differences: ValueDifference[];
  summary: string;
}
