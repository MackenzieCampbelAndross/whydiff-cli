const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

export function isIdempotentMethod(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

export function shouldRetryRequest(
  method: string,
  statusCode: number | undefined,
  error: Error | undefined,
  retryNonIdempotent: boolean,
  retryStatusCodes: number[] = [502, 503, 504]
): boolean {
  const isIdempotent = isIdempotentMethod(method);

  // Non-idempotent methods (POST, PATCH) must NOT be retried unless explicitly allowed
  if (!isIdempotent && !retryNonIdempotent) {
    return false;
  }

  // If a network/timeout error occurred
  if (error) {
    return true;
  }

  // If a transient HTTP status code occurred (e.g. 502, 503, 504)
  if (statusCode && retryStatusCodes.includes(statusCode)) {
    return true;
  }

  return false;
}

export function calculateBackoffDelay(
  attempt: number,
  initialDelayMs = 50,
  backoffFactor = 2,
  maxDelayMs = 500
): number {
  if (attempt <= 1) return initialDelayMs;
  const delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
  return Math.min(delay, maxDelayMs);
}
