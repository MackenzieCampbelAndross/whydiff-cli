import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppAdapter, AdapterExecutionOptions } from "../types.js";
import { HttpProbe } from "../../probes/types.js";
import { Observation } from "../../observations/types.js";
import { injectAuthIntoProbe } from "../../auth/injector.js";

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
    revisionRef: string,
    options: AdapterExecutionOptions = {}
  ): Promise<Observation[]> {
    const resolvedRoot = path.resolve(appRoot);
    const resolvedEntry = path.isAbsolute(entrypoint)
      ? entrypoint
      : path.resolve(resolvedRoot, entrypoint);

    try {
      await fs.stat(resolvedEntry);
    } catch {
      throw new Error(`Application entrypoint not found at ${resolvedEntry}`);
    }

    // Apply auth profile to probes
    const authenticatedProbes = probes.map(p =>
      options.authProfile ? injectAuthIntoProbe(p, options.authProfile) : p
    );

    const runnerScriptPath = path.join(resolvedRoot, `.whydiff_runner_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mjs`);
    const inputJsonPath = path.join(resolvedRoot, `.whydiff_input_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.json`);
    const outputJsonPath = path.join(resolvedRoot, `.whydiff_output_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.json`);

    const runnerSource = `
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

async function main() {
  const inputRaw = await fs.readFile(process.argv[2], "utf-8");
  const input = JSON.parse(inputRaw);
  const { entrypoint, exportName, probes, timeoutMs, revisionRef, reliability } = input;

  const maxRetries = (reliability && typeof reliability.max_retries === "number") ? reliability.max_retries : 0;
  const backoffMs = (reliability && typeof reliability.backoff_ms === "number") ? reliability.backoff_ms : 50;
  const backoffFactor = (reliability && typeof reliability.backoff_factor === "number") ? reliability.backoff_factor : 2;
  const retryNonIdempotent = !!(reliability && reliability.retry_non_idempotent);
  const retryStatusCodes = (reliability && reliability.retry_status_codes) || [502, 503, 504];

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
      const isIdempotent = IDEMPOTENT_METHODS.has(probe.method.toUpperCase());
      const canRetry = isIdempotent || retryNonIdempotent;

      let attempt = 0;
      let lastResponse = null;
      let lastError = null;
      let retryLog = [];
      let currentDelay = backoffMs;

      while (attempt <= maxRetries) {
        attempt++;
        let timer = null;
        try {
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Probe execution timed out after " + probeTimeout + "ms")), probeTimeout);
            if (timer.unref) timer.unref();
          });

          const injectPromise = app.inject(injectOpts);
          const response = await Promise.race([injectPromise, timeoutPromise]);
          if (timer) clearTimeout(timer);

          lastResponse = response;
          lastError = null;

          if (canRetry && attempt <= maxRetries && retryStatusCodes.includes(response.statusCode)) {
            retryLog.push("Attempt " + attempt + ": Received HTTP " + response.statusCode + ", retrying in " + currentDelay + "ms");
            await new Promise(r => setTimeout(r, currentDelay));
            currentDelay *= backoffFactor;
            continue;
          }
          break;
        } catch (err) {
          if (timer) clearTimeout(timer);
          lastError = err;
          lastResponse = null;

          if (canRetry && attempt <= maxRetries) {
            retryLog.push("Attempt " + attempt + ": Error " + err.message + ", retrying in " + currentDelay + "ms");
            await new Promise(r => setTimeout(r, currentDelay));
            currentDelay *= backoffFactor;
            continue;
          }
          break;
        }
      }

      const durationMs = Date.now() - startTime;

      if (lastResponse) {
        let parsedBody = lastResponse.body;
        let isMalformed = false;
        const cType = (lastResponse.headers && (lastResponse.headers["content-type"] || lastResponse.headers["Content-Type"])) || "";

        if (cType.includes("application/json")) {
          try {
            parsedBody = JSON.parse(lastResponse.body);
          } catch {
            isMalformed = true;
          }
        } else {
          try {
            parsedBody = JSON.parse(lastResponse.body);
          } catch {
            // Keep as string
          }
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
            statusCode: lastResponse.statusCode,
            headers: lastResponse.headers || {},
            body: parsedBody,
            contentType: cType,
            isMalformedJson: isMalformed
          },
          durationMs,
          attempts: attempt,
          retryLog: retryLog.length > 0 ? retryLog : undefined,
          category: probe.category,
          intent: probe.intent,
          motivatedBy: probe.motivatedBy
        });
      } else {
        const failureType = (lastError && lastError.message.includes("timed out"))
          ? "timeout"
          : "application_error";

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
          attempts: attempt,
          retryLog: retryLog.length > 0 ? retryLog : undefined,
          category: probe.category,
          intent: probe.intent,
          motivatedBy: probe.motivatedBy,
          error: {
            name: lastError ? (lastError.name || "Error") : "Error",
            message: lastError ? (lastError.message || String(lastError)) : "Unknown execution error",
            stack: lastError?.stack,
            failureType
          }
        });
      }
    }
  } catch (initErr) {
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
        category: probe.category,
        intent: probe.intent,
        motivatedBy: probe.motivatedBy,
        error: {
          name: initErr.name || "InitializationError",
          message: initErr.message || String(initErr),
          stack: initErr.stack,
          failureType: "application_error"
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
            probes: authenticatedProbes,
            timeoutMs,
            revisionRef,
            reliability: options.reliability
          },
          null,
          2
        ),
        "utf-8"
      );

      await execFileAsync("node", [runnerScriptPath, inputJsonPath, outputJsonPath], {
        cwd: resolvedRoot,
        timeout: Math.max(timeoutMs * probes.length * 3 + 15000, 45000),
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
      await fs.rm(runnerScriptPath, { force: true }).catch(() => {});
      await fs.rm(inputJsonPath, { force: true }).catch(() => {});
      await fs.rm(outputJsonPath, { force: true }).catch(() => {});
    }
  }
}
