import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { GitFixture } from "@whydiff/test-utils";
import { createWorktree, removeWorktree, listWorktrees, resolveRevision } from "@whydiff/core";

describe("Integration: Git Worktree Isolation", () => {
  let fixture: GitFixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = null;
    }
  });

  it("creates and cleans up isolated worktree without modifying user's main branch", async () => {
    fixture = await GitFixture.create(os.tmpdir(), "worktree-test");

    // Commit baseline file
    const c1 = await fixture.commitFiles("Initial commit", {
      "file.txt": "v1 content"
    });

    // Check resolve
    const sha = await resolveRevision("HEAD", fixture.dir);
    expect(sha).toBe(c1);

    const wtTarget = path.join(fixture.dir, ".whydiff", "worktrees", "wt-1");

    // Create worktree
    await createWorktree(fixture.dir, sha, wtTarget);

    const worktrees = await listWorktrees(fixture.dir);
    expect(worktrees.length).toBeGreaterThanOrEqual(2);

    const wtFile = await fs.readFile(path.join(wtTarget, "file.txt"), "utf-8");
    expect(wtFile).toBe("v1 content");

    // Modify worktree file
    await fs.writeFile(path.join(wtTarget, "file.txt"), "modified in worktree", "utf-8");

    // Verify main repo file is untouched!
    const mainFile = await fs.readFile(path.join(fixture.dir, "file.txt"), "utf-8");
    expect(mainFile).toBe("v1 content");

    // Remove worktree
    await removeWorktree(fixture.dir, wtTarget);

    const worktreesAfter = await listWorktrees(fixture.dir);
    const exists = worktreesAfter.some(w => w.path.toLowerCase() === wtTarget.toLowerCase());
    expect(exists).toBe(false);
  });
});
