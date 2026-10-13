// src/state.ts
//
// What Meowdere remembers between restarts, in one small JSON file: where it
// got to on each repo, and its "Unreleased" message.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Commit } from "./github.ts";

export interface RepoState {
  /** The newest commit already seen. Null until the first check. */
  lastSha: string | null;
  /** Commits not yet deployed, oldest first. */
  pending: Commit[];
  /** The "Unreleased" message in the changelog channel, if there is one. */
  unreleasedMessageId: string | null;
  /** Deploy runs already reported, newest last, kept short. */
  seenRuns: number[];
}

/** Shipped commits waiting for the weekly digest. */
export interface DigestState {
  /** ISO time of the last digest, or of when the digest was switched on. */
  lastPostedAt: string;
  commits: Commit[];
}

export type State = Record<string, RepoState>;

/** Kept beside the repos under a key no repo name ("owner/name") can take. */
export function digestState(state: State): DigestState {
  const s = state as unknown as Record<string, DigestState>;
  return (s["#digest"] ??= { lastPostedAt: new Date().toISOString(), commits: [] });
}

export function loadState(file: string): State {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as State;
  } catch {
    return {};
  }
}

/** Written to a temp file first, so a crash mid-write can't corrupt it. */
export function saveState(file: string, state: State): void {
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${file}.tmp`, file);
}

export function repoState(state: State, repo: string): RepoState {
  return (state[repo] ??= { lastSha: null, pending: [], unreleasedMessageId: null, seenRuns: [] });
}
