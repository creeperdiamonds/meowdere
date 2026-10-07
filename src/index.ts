// src/index.ts
//
// Meowdere: GitHub commits and deploys become forum changelogs, new forum
// posts ping the owner, and "@Meowdere mark as <tag>" tags a post.
//
// A changelog's life: new commits on the branch open an "Unreleased" post
// (or add to the open one). When the deploy workflow succeeds, that post
// becomes the release: renamed, tagged Deployed, the owner pinged, archived.
// A failed deploy pings the owner in the same post and leaves it open.

import { existsSync } from "node:fs";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type AnyThreadChannel,
  type ForumChannel,
  type Message,
} from "discord.js";
import { loadConfig, type RepoConfig } from "./config.ts";
import { GitHub, newSince, type Run } from "./github.ts";
import { releasedBody, releasedTitle, shipped, unreleasedBody, unreleasedTitle } from "./changelog.ts";
import { matchTag, parseCommand, type Tag } from "./commands.ts";
import { loadState, repoState, saveState, type RepoState } from "./state.ts";
import { voice } from "./voice.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const github = new GitHub(config.githubToken);
const state = loadState(config.stateFile);
const save = () => saveState(config.stateFile, state);

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

/** Only the owner is ever pinged, whatever a commit message contains. */
const pingOwner = { parse: [], users: [config.ownerId] } as const;
const pingNobody = { parse: [] } as const;

// ---- the changelog forum ----

const CHANGELOG_TAGS = [
  { name: "Unreleased", emoji: "🔧" },
  { name: "Deployed", emoji: "🚀" },
  { name: "Deploy failed", emoji: "😿" },
];

async function changelogForum(): Promise<ForumChannel> {
  const channel = await client.channels.fetch(config.changelogForumId);
  if (channel?.type !== ChannelType.GuildForum) throw new Error("CHANGELOG_FORUM_ID isn't a forum channel");
  return channel;
}

/** Adds the changelog tags the forum is missing. Needs Manage Channels; without it posts just go untagged. */
async function ensureChangelogTags(forum: ForumChannel) {
  const missing = CHANGELOG_TAGS.filter((w) => !forum.availableTags.some((t) => t.name.toLowerCase() === w.name.toLowerCase()));
  if (missing.length === 0) return;
  try {
    await forum.setAvailableTags([
      ...forum.availableTags,
      ...missing.map((m) => ({ name: m.name, emoji: { id: null, name: m.emoji } })),
    ]);
    log("Added changelog tags:", missing.map((m) => m.name).join(", "));
  } catch (err) {
    log("Couldn't add changelog tags (give me Manage Channels on the forum, or add them yourself):", String(err));
  }
}

function tagIds(forum: ForumChannel, ...names: string[]): string[] {
  return names
    .map((n) => forum.availableTags.find((t) => t.name.toLowerCase() === n.toLowerCase())?.id)
    .filter((id): id is string => Boolean(id));
}

async function openThread(id: string | null): Promise<AnyThreadChannel | null> {
  if (!id) return null;
  try {
    const channel = await client.channels.fetch(id);
    if (!channel?.isThread()) return null;
    if (channel.archived) await channel.setArchived(false);
    return channel;
  } catch {
    return null; // deleted by hand: start a fresh one
  }
}

/** The intro line is kept when the list is redrawn, so an edit doesn't change her words. */
const introOf = (content: string) => content.split("\n\n")[0];

async function addToUnreleased(rc: RepoConfig, st: RepoState, added: number) {
  const forum = await changelogForum();
  const thread = await openThread(st.unreleasedThreadId);
  if (thread) {
    const starter = await thread.fetchStarterMessage();
    if (starter) await starter.edit({ content: unreleasedBody(introOf(starter.content), rc.repo, rc.branch, st.pending), allowedMentions: pingNobody });
    await thread.send({ content: voice.morePushed(added), allowedMentions: pingNobody });
    return;
  }
  const created = await forum.threads.create({
    name: unreleasedTitle(rc.repo),
    message: { content: unreleasedBody(voice.unreleasedIntro(config.ownerId), rc.repo, rc.branch, st.pending), allowedMentions: pingOwner },
    appliedTags: tagIds(forum, "Unreleased"),
  });
  st.unreleasedThreadId = created.id;
  log(`${rc.repo}: opened Unreleased post ${created.id}`);
}

async function reportRun(rc: RepoConfig, st: RepoState, run: Run) {
  const forum = await changelogForum();
  const failed = run.conclusion === "failure" || run.conclusion === "timed_out";
  if (run.conclusion !== "success" && !failed) return; // cancelled or skipped: nothing to say

  if (failed) {
    const thread = await openThread(st.unreleasedThreadId);
    if (thread) {
      await thread.send({ content: voice.deployFailed(config.ownerId, run.number, run.url), allowedMentions: pingOwner });
      await thread.setAppliedTags([...new Set([...thread.appliedTags, ...tagIds(forum, "Deploy failed")])].slice(0, 5));
    } else {
      await forum.threads.create({
        name: `${rc.repo.split("/")[1]} · deploy #${run.number} failed`,
        message: { content: voice.deployFailed(config.ownerId, run.number, run.url), allowedMentions: pingOwner },
        appliedTags: tagIds(forum, "Deploy failed"),
      });
    }
    log(`${rc.repo}: deploy #${run.number} failed`);
    return;
  }

  const { shipped: done, left } = shipped(st.pending, run.headSha);
  const thread = done.length ? await openThread(st.unreleasedThreadId) : null;
  const name = releasedTitle(rc.repo, done, new Date());
  const body = releasedBody(done.length ? "💕 Shipped with love, nya~" : voice.redeployed(config.ownerId), rc.repo, done, run.number, run.url);

  if (thread) {
    const starter = await thread.fetchStarterMessage();
    if (starter) await starter.edit({ content: body, allowedMentions: pingNobody });
    await thread.send({ content: voice.deployed(config.ownerId), allowedMentions: pingOwner });
    await thread.edit({ name, appliedTags: tagIds(forum, "Deployed") });
    await thread.setArchived(true);
  } else {
    const created = await forum.threads.create({
      name,
      message: { content: body, allowedMentions: pingOwner },
      appliedTags: tagIds(forum, "Deployed"),
    });
    await created.setArchived(true);
  }
  log(`${rc.repo}: deploy #${run.number} shipped ${done.length} commit(s)`);

  st.pending = left;
  st.unreleasedThreadId = null;
  // Commits pushed after what this run deployed get a fresh Unreleased post.
  if (left.length) await addToUnreleased(rc, st, left.length);
}

async function pollRepo(rc: RepoConfig) {
  const st = repoState(state, rc.repo);
  const commits = await github.commits(rc.repo, rc.branch);

  // First look at a repo: remember where it is, don't post its history.
  if (st.lastSha === null) {
    st.lastSha = commits[0]?.sha ?? null;
    if (rc.deployWorkflow) {
      st.seenRuns = (await github.runs(rc.repo, rc.deployWorkflow)).filter((r) => r.status === "completed").map((r) => r.id);
    }
    save();
    log(`${rc.repo}: tracking from ${st.lastSha?.slice(0, 7) ?? "an empty branch"}`);
    return;
  }

  const fresh = newSince(commits, st.lastSha);
  if (fresh.length) {
    st.pending.push(...fresh);
    st.lastSha = commits[0].sha;
    save();
    await addToUnreleased(rc, st, fresh.length);
    save();
  }

  if (rc.deployWorkflow) {
    const runs = await github.runs(rc.repo, rc.deployWorkflow);
    const finished = runs.filter((r) => r.status === "completed" && !st.seenRuns.includes(r.id)).reverse();
    for (const run of finished) {
      // Seen first, so one bad post can't make it report the same run forever.
      st.seenRuns = [...st.seenRuns, run.id].slice(-60);
      save();
      await reportRun(rc, st, run);
      save();
    }
  }
}

let polling = false;
async function pollAll() {
  if (polling) return;
  polling = true;
  try {
    for (const rc of config.repos) {
      try {
        await pollRepo(rc);
      } catch (err) {
        log(`${rc.repo}: check failed:`, String(err));
      }
    }
  } finally {
    polling = false;
  }
}

// ---- new posts in watched forums ----

client.on(Events.ThreadCreate, async (thread, newlyCreated) => {
  if (!newlyCreated || !thread.parentId || !config.watchForumIds.includes(thread.parentId)) return;
  if (thread.ownerId === client.user?.id) return; // her own posts already ping
  // A brand-new forum post can refuse messages until its first one lands.
  await new Promise((r) => setTimeout(r, 1500));
  try {
    await thread.send({ content: voice.newPost(config.ownerId), allowedMentions: pingOwner });
  } catch (err) {
    log("Couldn't ping in new post", thread.id, String(err));
  }
});

// ---- @Meowdere mark as <tag> ----

client.on(Events.MessageCreate, async (msg) => {
  const me = client.user;
  if (!me || msg.author.bot || !msg.inGuild()) return;
  // A real @mention in the text, not a reply that happens to ping her.
  const mention = new RegExp(`<@!?${me.id}>`, "g");
  if (!mention.test(msg.content)) return;
  try {
    await handleCommand(msg, msg.content.replace(mention, ""));
  } catch (err) {
    log("Command failed:", String(err));
  }
});

async function handleCommand(msg: Message<true>, text: string) {
  const reply = (content: string) => msg.reply({ content, allowedMentions: { ...pingNobody, repliedUser: false } });
  const cmd = parseCommand(text);
  if (cmd.kind === "help") return reply(voice.help());

  const thread = msg.channel;
  if (!thread.isThread() || thread.parent?.type !== ChannelType.GuildForum) return reply(voice.notForum());
  const forum = thread.parent;
  const tags: Tag[] = forum.availableTags.map((t) => ({ id: t.id, name: t.name }));
  if (cmd.kind === "tags") return reply(voice.tags(tags.map((t) => t.name)));

  const allowed = msg.author.id === config.ownerId || msg.member?.permissionsIn(thread).has(PermissionFlagsBits.ManageThreads);
  if (!allowed) return reply(voice.notAllowed());

  const current = thread.appliedTags;
  const setTags = async (ids: string[]) => {
    try {
      await thread.setAppliedTags(ids);
      return true;
    } catch {
      await reply(voice.cantEdit());
      return false;
    }
  };

  if (cmd.kind === "unmarkAll") {
    if (await setTags([])) await reply(voice.unmarkedAll());
    return;
  }

  const chosen: Tag[] = [];
  for (const name of cmd.names) {
    const found = matchTag(name, tags);
    if ("error" in found) return reply(found.error);
    chosen.push(found.tag);
  }
  const names = chosen.map((t) => t.name);

  if (cmd.kind === "mark") {
    const add = chosen.filter((t) => !current.includes(t.id)).map((t) => t.id);
    if (add.length === 0) return reply(voice.alreadyMarked(names));
    if (current.length + add.length > 5) return reply(voice.tooManyTags());
    if (await setTags([...current, ...add])) await reply(voice.marked(names));
  } else {
    const drop = new Set(chosen.map((t) => t.id));
    if (!current.some((id) => drop.has(id))) return reply(voice.notMarked(names));
    if (await setTags(current.filter((id) => !drop.has(id)))) await reply(voice.unmarked(names));
  }
}

// ---- start ----

client.once(Events.ClientReady, async (c) => {
  log(`Logged in as ${c.user.tag}, nya~ Watching ${config.repos.map((r) => r.repo).join(", ")}`);
  try {
    await ensureChangelogTags(await changelogForum());
  } catch (err) {
    log(String(err));
  }
  await pollAll();
  setInterval(pollAll, config.pollSeconds * 1000);
});

client.login(config.token);
