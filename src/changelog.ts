// src/changelog.ts
//
// Turning commits into the text of a changelog message. No Discord here, so it
// can be tested on its own.

import type { Commit } from "./github.ts";

/** Discord's limit on a message, less room for the ping and heading. */
const BODY_LIMIT = 1700;

/** "- Fix the thing ([abc1234](url)) · author", one per commit. */
export function commitLine(c: Commit): string {
  const title = c.title.length > 120 ? `${c.title.slice(0, 119)}…` : c.title;
  return `- ${title} ([\`${c.sha.slice(0, 7)}\`](<${c.url}>)) · ${c.author}`;
}

/** Commit lines that fit in one message, oldest first, with a count of the rest. */
export function commitList(commits: Commit[], limit = BODY_LIMIT): string {
  if (commits.length === 0) return "_No new commits: a redeploy of what was already live._";
  const lines: string[] = [];
  let used = 0;
  for (const c of commits) {
    const line = commitLine(c);
    if (used + line.length + 1 > limit - 40) break;
    lines.push(line);
    used += line.length + 1;
  }
  const rest = commits.length - lines.length;
  if (rest > 0) lines.push(`…and ${rest} more.`);
  return lines.join("\n");
}

/** The intro is Meowdere's line (voice.ts); the list is the changelog. */
export function unreleasedBody(intro: string, repo: string, branch: string, commits: Commit[]): string {
  return `${intro}\n\n**Unreleased on \`${repo}@${branch}\`** (${commits.length} commit${commits.length === 1 ? "" : "s"})\n${commitList(commits)}`;
}

/** "## appealy · 7 Oct 2026", then the run and what shipped. */
export function releasedBody(intro: string, repo: string, commits: Commit[], runNumber: number, runUrl: string, when: Date): string {
  return `## ${releasedHeading(repo, when)}\n${intro} Deployed in [run #${runNumber}](<${runUrl}>).\n${commitList(commits)}`;
}

export function releasedHeading(repo: string, when: Date): string {
  const date = when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${repo.split("/")[1] ?? repo} · ${date}`;
}

/**
 * Which pending commits a deploy of `headSha` shipped: everything up to and
 * including that commit. A sha we never saw (deployed before we started
 * tracking, or a different branch) ships nothing we're holding.
 */
export function shipped(pending: Commit[], headSha: string): { shipped: Commit[]; left: Commit[] } {
  const i = pending.findIndex((c) => c.sha === headSha);
  if (i === -1) return { shipped: [], left: pending };
  return { shipped: pending.slice(0, i + 1), left: pending.slice(i + 1) };
}
