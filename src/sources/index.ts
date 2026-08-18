import type { JobSource } from "./types.js";
import { wellfoundSource } from "./wellfound.js";
import { remoteOkSource } from "./remoteok.js";
import { weWorkRemotelySource } from "./wwr.js";
import { ycSource } from "./yc.js";

export type { JobSource } from "./types.js";

export const allSources: JobSource[] = [wellfoundSource, remoteOkSource, weWorkRemotelySource, ycSource];

export function resolveSources(ids?: string[]): JobSource[] {
  if (ids === undefined || ids.length === 0) {
    return allSources;
  }

  const requested = new Set(ids.map((id) => id.trim().toLowerCase()).filter((id) => id !== ""));
  const resolved = allSources.filter((source) => requested.has(source.id));

  if (resolved.length === 0) {
    throw new Error(`No matching job sources for: ${ids.join(", ")}`);
  }

  return resolved;
}
