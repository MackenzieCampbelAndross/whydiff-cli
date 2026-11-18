import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppAdapter } from "../types.js";
import { HttpProbe } from "../../probes/types.js";
import { Observation } from "../../observations/types.js";

const execFileAsync = promisify(execFile);

export class FastifyAdapter implements AppAdapter {
  public readonly name = "fastify";

  public isApplicable(framework: string): boolean {
    return framework.toLowerCase() === "fastify";
  }

  public async executeProbes(
    appRoot: string,
    entrypoint: string,
    exportName: string,
    probes: HttpProbe[],
    timeoutMs: number,
    revisionRef: string
  ): Promise<Observation[]> {
    const resolvedRoot = path.resolve(appRoot);
    const resolvedEntry = path.isAbsolute(entrypoint)
      ? entrypoint
      : path.resolve(resolvedRoot, entrypoint);

    // Verify entrypoint exists
    try {
      await fs.stat(resolvedEntry);
    } catch {
      throw new Error(`Application entrypoint not found at ${resolvedEntry}`);
    }

    const runnerScriptPath = path.join(resolvedRoot, `.whydiff_runner_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mjs`);
    const inputJsonPath = path.join(resolvedRoot, `.whydiff_input_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.json`);
    const outputJsonPath = path.join(resolvedRoot, `.whydiff_output_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.json`);

    const runnerSource = `
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function main() {
  const inputRaw = await fs.readFile(process.argv[2], "utf-8");
  const input = JSON.parse(inputRaw);
  const { entrypoint, exportName, probes, timeoutMs, revisionRef } = input;

  const observations = [];
  let app = null;

  try {
    const entryUrl = pathToFileURL(entrypoint).href;
    const mod = await import(entryUrl);
    let factory = mod[exportName] || mod.default;

    if (!factory) {
      const keys = Object.keys(mod).join(", ");
      throw new Error("Export '" + exportName + "' not found in " + entrypoint + ". Available exports: [" + keys + "]");
    }

    if (typeof factory === "function") {
      app = await factory();
    } else if (factory && typeof factory.inject === "function") {
      app = factory;
    } else {
      throw new Error("Export '" + exportName + "' is neither a Fastify instance nor a factory function");
    }

    if (typeof app.ready === "function") {
      await app.ready();
    }

    for (const probe of probes) {
      const startTime = Date.now();
      const obsTimestamp = new Date().toISOString();

      let queryStr = "";
      if (probe.query && Object.keys(probe.query).length > 0) {
        const params = new URLSearchParams(probe.query);
        queryStr = "?" + params.toString();
      }

      const injectOpts = {
        method: probe.method,
        url: probe.path + queryStr,
        headers: probe.headers || {},
        payload: probe.payload
      };

      const probeTimeout = probe.timeoutMs || timeoutMs;

      let timer = null;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Probe execution timed out after " + probeTimeout + "ms")), probeTimeout);
          if (timer.unref) timer.unref();
        });

        const injectPromise = app.inject(injectOpts);
        const response = await Promise.race([injectPromise, timeoutPromise]);
        if (timer) clearTimeout(timer);

        const durationMs = Date.now() - startTime;

        let parsedBody = response.body;
        try {
          parsedBody = JSON.parse(response.body);
        } catch {
          // Keep raw string body
        }

        observations.push({
          probeId: probe.id,
          revision: revisionRef,
          timestamp: obsTimestamp,
          request: {
            method: probe.method,
            path: probe.path,
            query: probe.query,
            headers: probe.headers,
            payload: probe.payload
          },
          response: {
            statusCode: response.statusCode,
            headers: response.headers || {},
            body: parsedBody
          },
          durationMs
        });
      } catch (probeErr) {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        observations.push({
          probeId: probe.id,
          revision: revisionRef,
          timestamp: obsTimestamp,
          request: {
            method: probe.method,
            path: probe.path,
            query: probe.query,
            headers: probe.headers,
            payload: probe.payload
          },
          durationMs,
          error: {
            name: probeErr.name || "Error",
            message: probeErr.message || String(probeErr),
            stack: probeErr.stack
          }
        });
      }
    }
  } catch (initErr) {
    // If the entire application fails to initialize or import
    for (const probe of probes) {
      observations.push({
        probeId: probe.id,
        revision: revisionRef,
        timestamp: new Date().toISOString(),
        request: {
          method: probe.method,
          path: probe.path,
          query: probe.query,
          headers: probe.headers,
          payload: probe.payload
        },
        error: {
          name: initErr.name || "InitializationError",
          message: initErr.message || String(initErr),
          stack: initErr.stack
        }
      });
    }
  } finally {
    if (app && typeof app.close === "function") {
      try {
        await app.close();
      } catch {
        // Ignore close errors
      }
    }
    await fs.writeFile(process.argv[3], JSON.stringify(observations, null, 2), "utf-8");
  }
}

main().catch(err => {
  console.error("FATAL RUNNER ERROR:", err);
  process.exit(1);
});
`;

    try {
      await fs.writeFile(runnerScriptPath, runnerSource, "utf-8");
      await fs.writeFile(
        inputJsonPath,
        JSON.stringify(
          {
            entrypoint: resolvedEntry,
            exportName,
            probes,
            timeoutMs,
            revisionRef
          },
          null,
          2
        ),
        "utf-8"
      );

      // Execute runner in worker subprocess
      await execFileAsync("node", [runnerScriptPath, inputJsonPath, outputJsonPath], {
        cwd: resolvedRoot,
        timeout: Math.max(timeoutMs * probes.length + 15000, 30000),
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: "test"
        }
      });

      const outputRaw = await fs.readFile(outputJsonPath, "utf-8");
      return JSON.parse(outputRaw) as Observation[];
    } catch (err: unknown) {
      const execError = err as { message: string; stderr?: string };
      const details = execError.stderr ? `\nStderr: ${execError.stderr.trim()}` : "";
      throw new Error(`Failed to execute Fastify probes: ${execError.message}${details}`);
    } finally {
      // Clean up temporary runner files
      await fs.rm(runnerScriptPath, { force: true }).catch(() => {});
      await fs.rm(inputJsonPath, { force: true }).catch(() => {});
      await fs.rm(outputJsonPath, { force: true }).catch(() => {});
    }
  }
}
