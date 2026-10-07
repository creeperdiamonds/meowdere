// src/config.ts
//
// Everything Meowdere needs, read once from the environment (.env).

export interface RepoConfig {
  /** owner/name */
  repo: string;
  branch: string;
  /** The workflow file whose runs count as deploys, e.g. deploy-merged.yml. */
  deployWorkflow: string | null;
}

export interface Config {
  token: string;
  ownerId: string;
  githubToken: string;
  repos: RepoConfig[];
  changelogForumId: string;
  /** Forums where every new post pings the owner. */
  watchForumIds: string[];
  pollSeconds: number;
  stateFile: string;
}

/** "owner/name@branch:workflow.yml", with the branch and workflow optional. */
export function parseRepo(spec: string): RepoConfig {
  const m = spec.trim().match(/^([\w.-]+\/[\w.-]+)(?:@([^:]+))?(?::(.+))?$/);
  if (!m) throw new Error(`REPOS: can't read "${spec}". Use owner/name@branch:workflow.yml`);
  return { repo: m[1], branch: m[2] ?? "main", deployWorkflow: m[3] ?? null };
}

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (name: string) => {
    const v = env[name]?.trim();
    if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
    return v;
  };
  const repos = list(need("REPOS")).map(parseRepo);
  return {
    token: need("DISCORD_TOKEN"),
    ownerId: need("OWNER_ID"),
    githubToken: need("GITHUB_TOKEN"),
    repos,
    changelogForumId: need("CHANGELOG_FORUM_ID"),
    watchForumIds: list(env.WATCH_FORUM_IDS),
    pollSeconds: Math.max(30, Number(env.POLL_SECONDS) || 60),
    stateFile: env.STATE_FILE?.trim() || "state.json",
  };
}
