export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

export interface RevisionPair {
  baseRef: string;
  candidateRef: string;
  baseSha: string;
  candidateSha: string;
}

export interface WorktreeInfo {
  path: string;
  commitSha: string;
  branch?: string;
  bare?: boolean;
}
