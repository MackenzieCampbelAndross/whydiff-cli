import { describe, it, expect } from "vitest";
import { parseRevisionRange, GitError } from "@whydiff/core";

describe("Unit: Git CLI Integration", () => {
  it("parses valid two-dot revision ranges", () => {
    expect(parseRevisionRange("main..HEAD")).toEqual({
      baseRef: "main",
      candidateRef: "HEAD"
    });

    expect(parseRevisionRange("origin/main..feat/branch")).toEqual({
      baseRef: "origin/main",
      candidateRef: "feat/branch"
    });

    expect(parseRevisionRange("v1.0.0..v1.1.0")).toEqual({
      baseRef: "v1.0.0",
      candidateRef: "v1.1.0"
    });

    expect(parseRevisionRange("HEAD~1..HEAD")).toEqual({
      baseRef: "HEAD~1",
      candidateRef: "HEAD"
    });

    expect(parseRevisionRange("abc1234..def5678")).toEqual({
      baseRef: "abc1234",
      candidateRef: "def5678"
    });
  });

  it("rejects invalid revision range formats", () => {
    expect(() => parseRevisionRange("main")).toThrowError(GitError);
    expect(() => parseRevisionRange("main...HEAD")).toThrowError(GitError);
    expect(() => parseRevisionRange("..HEAD")).toThrowError(GitError);
    expect(() => parseRevisionRange("main..")).toThrowError(GitError);
    expect(() => parseRevisionRange("")).toThrowError(GitError);
  });
});
