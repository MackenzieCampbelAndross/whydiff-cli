export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 2,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CliError";
  }
}
