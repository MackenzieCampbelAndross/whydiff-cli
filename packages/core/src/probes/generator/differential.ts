import { ContractDiffResult, OpenApiSpec, ContractDelta } from "../../openapi/types.js";
import { HttpProbe } from "../types.js";
import { generateProbesFromSpec } from "./generator.js";

export function generateDifferentialProbes(
  diff: ContractDiffResult,
  baselineSpec: OpenApiSpec,
  candidateSpec: OpenApiSpec
): HttpProbe[] {
  const probes: HttpProbe[] = [];

  // Generate probes from candidate spec
  const candProbes = generateProbesFromSpec(candidateSpec, { includeInvalid: true });
  // Generate probes from baseline spec for removed endpoints
  const baseProbes = generateProbesFromSpec(baselineSpec, { includeInvalid: false });

  const targetedDeltas = diff.deltas.filter(d => d.severity === "breaking" || d.severity === "risky");

  for (const delta of targetedDeltas) {
    if (delta.kind === "endpoint_removed" || delta.kind === "method_removed") {
      // Find matching probe from baseline to verify candidate returns 404 or fails
      const matching = baseProbes.find(p => p.sourcePath === delta.path && (!delta.method || p.method === delta.method));
      if (matching) {
        probes.push({
          ...matching,
          id: `diff_${delta.id}_${matching.id}`,
          name: `[Diff: ${delta.id}] Verify removed endpoint ${delta.method || ""} ${delta.path}`,
          motivatedBy: delta.id,
          intent: "differential",
          tags: ["differential", delta.kind]
        });
      }
    } else {
      // Target candidate probes matching the delta path
      const matchings = candProbes.filter(p => p.sourcePath === delta.path && (!delta.method || p.method === delta.method));
      for (const match of matchings) {
        probes.push({
          ...match,
          id: `diff_${delta.id}_${match.id}`,
          name: `[Diff: ${delta.id}] ${match.name}`,
          motivatedBy: delta.id,
          intent: "differential",
          tags: ["differential", delta.kind]
        });
      }
    }
  }

  // Deduplicate by probe method + path + payload JSON signature
  const seenSignatures = new Set<string>();
  const uniqueProbes: HttpProbe[] = [];

  for (const p of probes) {
    const sig = `${p.method}:${p.path}:${JSON.stringify(p.payload || {})}:${JSON.stringify(p.query || {})}`;
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      uniqueProbes.push(p);
    }
  }

  return uniqueProbes.sort((a, b) => a.id.localeCompare(b.id));
}
