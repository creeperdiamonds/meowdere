// src/config.ts
//
// Settings live in meowdere.config.json (copy meowdere.config.example.json).
// The two secrets, the Discord and GitHub tokens, stay in .env.

import { readFileSync } from "node:fs";

export interface RepoConfig {
  /** owner/name */
  repo: string;
  branch: string;
  /** The workflow file whose runs count as deploys, e.g. deploy-merged.yml. Null: commits only. */
  deployWorkflow: string | null;
}

/** When the weekly digest goes out: 0 = Sunday … 6 = Saturday, hour in UTC. */
export interface DigestConfig {
  weekday: number;
  hourUtc: number;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export interface Config {
  token: string;
  githubToken: string;
  ownerId: string;
  /** The text channel changelogs go to. */
  changelogChannelId: string;
  /** Forums where every new post pings the owner. */
  watchForumIds: string[];
  repos: RepoConfig[];
  pollSeconds: number;
  /** How long someone who pings the owner is timed out. 0 turns it off. */
  ownerPingTimeoutSeconds: number;
  /**
   * Set: releases stay in this server and following servers get one digest a
   * week instead. Null: every release is published as it ships.
   */
  digest: DigestConfig | null;
  stateFile: string;
}

function parseDigest(v: unknown): DigestConfig | null {
  if (v === undefined || v === null || v === false) return null;
  const d = v as Record<string, unknown>;
  const weekday = WEEKDAYS.indexOf(String(d.day ?? "").toLowerCase());
  if (weekday === -1) throw new Error(`digest.day must be a weekday name, like "monday"`);
  const hourUtc = d.hourUtc === undefined ? 16 : Number(d.hourUtc);
  if (!Number.isInteger(hourUtc) || hourUtc < 0 || hourUtc > 23) throw new Error("digest.hourUtc must be a whole hour from 0 to 23");
  return { weekday, hourUtc };
}

interface FileConfig {
  ownerId?: unknown;
  changelogChannelId?: unknown;
  watchForumIds?: unknown;
  repos?: unknown;
  pollSeconds?: unknown;
  ownerPingTimeoutSeconds?: unknown;
  digest?: unknown;
}

const snowflake = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !/^\d{17,20}$/.test(v)) throw new Error(`${name} must be a Discord ID in quotes, like "123456789012345678"`);
  return v;
};

function parseRepo(v: unknown, i: number): RepoConfig {
  const r = (v ?? {}) as Record<string, unknown>;
  if (typeof r.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(r.repo)) throw new Error(`repos[${i}].repo must look like "owner/name"`);
  return {
    repo: r.repo,
    branch: typeof r.branch === "string" && r.branch ? r.branch : "main",
    deployWorkflow: typeof r.deployWorkflow === "string" && r.deployWorkflow ? r.deployWorkflow : null,
  };
}

/** Checks the file's settings, so a typo fails at startup with a clear message. */
export function parseConfig(file: FileConfig, env: NodeJS.ProcessEnv): Config {
  const secret = (name: string) => {
    const v = env[name]?.trim();
    if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
    return v;
  };
  if (!Array.isArray(file.repos) || file.repos.length === 0) throw new Error("repos needs at least one repo");
  const forums = file.watchForumIds ?? [];
  if (!Array.isArray(forums)) throw new Error("watchForumIds must be a list");
  return {
    token: secret("DISCORD_TOKEN"),
    githubToken: secret("GITHUB_TOKEN"),
    ownerId: snowflake(file.ownerId, "ownerId"),
    changelogChannelId: snowflake(file.changelogChannelId, "changelogChannelId"),
    watchForumIds: forums.map((f, i) => snowflake(f, `watchForumIds[${i}]`)),
    repos: file.repos.map(parseRepo),
    pollSeconds: Math.max(30, Number(file.pollSeconds) || 60),
    // Short on purpose: a nudge, not a punishment. Capped at 10 minutes.
    ownerPingTimeoutSeconds: file.ownerPingTimeoutSeconds === undefined ? 60 : Math.min(600, Math.max(0, Number(file.ownerPingTimeoutSeconds) || 0)),
    digest: parseDigest(file.digest),
    stateFile: env.STATE_FILE?.trim() || "state.json",
  };
}

export function loadConfig(path = "meowdere.config.json", env: NodeJS.ProcessEnv = process.env): Config {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`No ${path}. Copy meowdere.config.example.json to ${path} and fill it in.`);
  }
  return parseConfig(JSON.parse(raw) as FileConfig, env);
}
