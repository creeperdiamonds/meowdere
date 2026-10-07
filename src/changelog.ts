// src/changelog.ts
//
// Turning commits into the text of a changelog post. No Discord here, so it
// can be tested on its own.

import type { Commit } from "./github.ts";

/** Discord's limit on a message, less room for the ping and heading. */
const BODY_LIMIT = 1700;
const TITLE_LIMIT = 100;

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

export function releasedBody(intro: string, repo: string, commits: Commit[], runNumber: number, runUrl: string): string {
  return `${intro}\n\n**Deployed \`${repo}\`** in [run #${runNumber}](<${runUrl}>)\n${commitList(commits)}`;
}

export function unreleasedTitle(repo: string): string {
  return clip(`Unreleased · ${repoName(repo)}`);
}

/** "appealy · 7 Oct 2026 · Fix checkout (+2)". */
export function releasedTitle(repo: string, commits: Commit[], when: Date): string {
  const date = when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const lead = commits.at(-1)?.title ?? "Redeploy";
  const more = commits.length > 1 ? ` (+${commits.length - 1})` : "";
  return clip(`${repoName(repo)} · ${date} · ${lead}${more}`);
}

const repoName = (repo: string) => repo.split("/")[1] ?? repo;

function clip(title: string): string {
  return title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1)}…` : title;
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
