import { join } from "path";
import { getConfigDir } from "./services/ConfigService.ts";

export function getSocketPath(): string {
  const runtimeDir = process.env["XDG_RUNTIME_DIR"];
  if (runtimeDir && runtimeDir.length > 0) {
    return join(runtimeDir, "apptoken.sock");
  }

  const uid = process.getuid?.() ?? 0;
  return `/tmp/apptoken-${uid}.sock`;
}

export function getPidPath(): string {
  return join(getConfigDir(), "daemon.pid");
}
