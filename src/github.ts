// src/github.ts
//
// The two things Meowdere asks GitHub: what's new on a branch, and how the
// deploy workflow's runs went. Polling, so no public URL or webhook is needed.

export interface Commit {
  sha: string;
  /** First line of the message. */
  title: string;
  author: string;
  url: string;
}

export interface Run {
  id: number;
  number: number;
  status: string;
  conclusion: string | null;
  headSha: string;
  url: string;
}

export class GitHub {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "meowdere",
      },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
    return res.json() as Promise<T>;
  }

  /** Newest first, up to 100. */
  async commits(repo: string, branch: string): Promise<Commit[]> {
    type Raw = { sha: string; html_url: string; commit: { message: string; author: { name: string } | null }; author: { login: string } | null };
    const raw = await this.get<Raw[]>(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=100`);
    return raw.map((c) => ({
      sha: c.sha,
      title: c.commit.message.split("\n")[0],
      author: c.author?.login ?? c.commit.author?.name ?? "unknown",
      url: c.html_url,
    }));
  }

  /** The workflow's latest runs, newest first. */
  async runs(repo: string, workflow: string): Promise<Run[]> {
    type Raw = { workflow_runs: { id: number; run_number: number; status: string; conclusion: string | null; head_sha: string; html_url: string }[] };
    const raw = await this.get<Raw>(`/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=20`);
    return raw.workflow_runs.map((r) => ({
      id: r.id,
      number: r.run_number,
      status: r.status,
      conclusion: r.conclusion,
      headSha: r.head_sha,
      url: r.html_url,
    }));
  }
}

/**
 * The commits after `lastSha`, oldest first. If `lastSha` isn't in the list
 * (a force-push, or more than 100 new commits), everything listed is new.
 */
export function newSince(newestFirst: Commit[], lastSha: string): Commit[] {
  const i = newestFirst.findIndex((c) => c.sha === lastSha);
  return (i === -1 ? newestFirst : newestFirst.slice(0, i)).reverse();
}
