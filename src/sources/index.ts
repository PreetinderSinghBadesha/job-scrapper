import type { JobSource } from "./types.js";
import { wellfoundSource } from "./wellfound.js";
import { remoteOkSource } from "./remoteok.js";
import { weWorkRemotelySource } from "./wwr.js";
import { ycSource } from "./yc.js";
import { autoSource } from "./auto.js";

export type { JobSource } from "./types.js";

// Sources here need no extra configuration and run by default. "auto" needs
// AUTO_SOURCE_URL (and, on a cache miss, ANTHROPIC_API_KEY) so it's opt-in
// only, via JOB_SOURCES=auto — it never runs just because JOB_SOURCES is unset.
export const defaultSources: JobSource[] = [wellfoundSource, remoteOkSource, weWorkRemotelySource, ycSource];
const optionalSources: JobSource[] = [autoSource];
const registeredSources: JobSource[] = [...defaultSources, ...optionalSources];

export function resolveSources(ids?: string[]): JobSource[] {
  if (ids === undefined || ids.length === 0) {
    return defaultSources;
  }

  const requested = new Set(ids.map((id) => id.trim().toLowerCase()).filter((id) => id !== ""));
  const resolved = registeredSources.filter((source) => requested.has(source.id));

  if (resolved.length === 0) {
    throw new Error(`No matching job sources for: ${ids.join(", ")}`);
  }

  return resolved;
}
