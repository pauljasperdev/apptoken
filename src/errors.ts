import { Data } from "effect";

export class ConfigNotFound extends Data.TaggedError("ConfigNotFound")<{
  readonly path: string;
}> {}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly message: string;
}> {}

export class PemNotFound extends Data.TaggedError("PemNotFound")<{
  readonly path: string;
}> {}

export class InvalidPassword extends Data.TaggedError("InvalidPassword") {}

export class DecryptError extends Data.TaggedError("DecryptError")<{
  readonly message: string;
}> {}

export class JwtGenerationError extends Data.TaggedError("JwtGenerationError")<{
  readonly message: string;
}> {}

export class GitHubApiError extends Data.TaggedError("GitHubApiError")<{
  readonly status: number;
  readonly message: string;
}> {}

export class DaemonNotRunning extends Data.TaggedError("DaemonNotRunning") {}

export class DaemonAlreadyRunning extends Data.TaggedError("DaemonAlreadyRunning") {}

export class DaemonError extends Data.TaggedError("DaemonError")<{
  readonly message: string;
}> {}

export class SocketError extends Data.TaggedError("SocketError")<{
  readonly message: string;
}> {}
