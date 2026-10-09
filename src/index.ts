// src/index.ts
//
// Meowdere: GitHub commits and deploys become changelogs in a text channel,
// new posts in watched forums ping the owner, and "@Meowdere mark as <tag>"
// tags a forum post.
//
// A changelog's life: new commits on the branch start an "Unreleased"
// message in the changelog channel, which she keeps editing as more arrive.
// When the deploy workflow succeeds, that message becomes the release's
// changelog and she replies to it, pinging the owner. A failed deploy is a
// reply too, and the commits wait for the next one.

import { existsSync } from "node:fs";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Message,
  type TextChannel,
} from "discord.js";
import { loadConfig, type RepoConfig } from "./config.ts";
import { GitHub, newSince, type Commit, type Run } from "./github.ts";
import { releasedBody, shipped, unreleasedBody } from "./changelog.ts";
import { matchTag, parseCommands, planTags, type Tag } from "./commands.ts";
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

// ---- the changelog channel ----

async function changelogChannel(): Promise<TextChannel> {
  const channel = await client.channels.fetch(config.changelogChannelId);
  if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) {
    throw new Error("changelogChannelId isn't a text channel");
  }
  return channel as TextChannel;
}

async function unreleasedMessage(channel: TextChannel, id: string | null): Promise<Message | null> {
  if (!id) return null;
  try {
    return await channel.messages.fetch(id);
  } catch {
    return null; // deleted by hand: start a fresh one
  }
}

/** The intro line is kept when the list is redrawn, so an edit doesn't change her words. */
const introOf = (content: string) => content.split("\n\n")[0];

async function addToUnreleased(rc: RepoConfig, st: RepoState) {
  const channel = await changelogChannel();
  const existing = await unreleasedMessage(channel, st.unreleasedMessageId);
  if (existing) {
    await existing.edit({ content: unreleasedBody(introOf(existing.content), rc.repo, rc.branch, st.pending), allowedMentions: pingNobody });
    return;
  }
  const sent = await channel.send({ content: unreleasedBody(voice.unreleasedIntro(), rc.repo, rc.branch, st.pending), allowedMentions: pingNobody });
  st.unreleasedMessageId = sent.id;
  log(`${rc.repo}: started an Unreleased message`);
}

/**
 * In an announcement channel, sends a released changelog on to every server
 * following it (Appealy's dashboard sets those follows up). Only releases:
 * the Unreleased draft, failed deploys and pings stay in this server. A
 * plain text channel has nothing to publish to, and that's fine.
 */
async function publish(message: Message) {
  if (!message.crosspostable) return;
  try {
    await message.crosspost();
  } catch (err) {
    log("Couldn't publish the changelog to followers:", String(err));
  }
}

async function reportRun(rc: RepoConfig, st: RepoState, run: Run) {
  const failed = run.conclusion === "failure" || run.conclusion === "timed_out";
  if (run.conclusion !== "success" && !failed) return; // cancelled or skipped: nothing to say
  const channel = await changelogChannel();
  const existing = await unreleasedMessage(channel, st.unreleasedMessageId);

  if (failed) {
    const content = voice.deployFailed(config.ownerId, run.number, run.url);
    if (existing) await existing.reply({ content, allowedMentions: pingOwner });
    else await channel.send({ content, allowedMentions: pingOwner });
    log(`${rc.repo}: deploy #${run.number} failed`);
    return;
  }

  const { shipped: done, left } = shipped(st.pending, run.headSha);
  if (done.length) {
    // The changelog itself, then the ping as a reply, so the published
    // message carries no mention of the owner into other servers.
    const body = releasedBody(voice.shippedIntro(), rc.repo, done, run.number, run.url, new Date());
    const release = existing
      ? await existing.edit({ content: body, allowedMentions: pingNobody })
      : await channel.send({ content: body, allowedMentions: pingNobody });
    await publish(release);
    await release.reply({ content: voice.deployed(config.ownerId), allowedMentions: pingOwner });
  } else {
    await channel.send({ content: voice.redeployed(config.ownerId), allowedMentions: pingOwner });
  }
  log(`${rc.repo}: deploy #${run.number} shipped ${done.length} commit(s)`);

  if (done.length) {
    await markFixed(done);
    st.pending = left;
    st.unreleasedMessageId = null;
    // Commits pushed after what this run deployed get a fresh Unreleased message.
    if (left.length) await addToUnreleased(rc, st);
  }
}

/**
 * Shipped commits that said "fixes #<post ID>": tag those posts Fixed and
 * tell whoever opened them, then lock them. Only posts in the watched forums, so a commit
 * message can't make her post anywhere else.
 */
async function markFixed(commits: Commit[]) {
  for (const commit of commits) {
    for (const postId of commit.fixes ?? []) {
      try {
        const thread = await client.channels.fetch(postId);
        if (!thread?.isThread() || !thread.parentId || !config.watchForumIds.includes(thread.parentId)) continue;
        if (thread.parent?.type !== ChannelType.GuildForum) continue;
        if (thread.archived) await thread.setArchived(false);
        const fixed = matchTag("Fixed", thread.parent.availableTags.map((t) => ({ id: t.id, name: t.name })));
        if ("tag" in fixed && !thread.appliedTags.includes(fixed.tag.id) && thread.appliedTags.length < 5) {
          await thread.setAppliedTags([...thread.appliedTags, fixed.tag.id]);
        }
        const reporter = thread.ownerId ?? null;
        await thread.send({ content: voice.fixShipped(reporter, commit.sha, commit.url), allowedMentions: { parse: [], users: reporter ? [reporter] : [] } });
        // Locked last, after her message: the report is done, so no more replies.
        await thread.setLocked(true, `Fixed in ${commit.sha.slice(0, 7)}`);
        log(`Marked post ${postId} fixed by ${commit.sha.slice(0, 7)} and locked it`);
      } catch (err) {
        log(`Couldn't mark post ${postId} fixed:`, String(err));
      }
    }
  }
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
    await addToUnreleased(rc, st);
    save();
  }

  if (rc.deployWorkflow) {
    const runs = await github.runs(rc.repo, rc.deployWorkflow);
    const finished = runs.filter((r) => r.status === "completed" && !st.seenRuns.includes(r.id)).reverse();
    for (const run of finished) {
      // Seen first, so one bad message can't make it report the same run forever.
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
  if (thread.ownerId === client.user?.id) return;
  // A brand-new forum post can refuse messages until its first one lands.
  await new Promise((r) => setTimeout(r, 1500));
  try {
    await thread.send({ content: voice.newPost(config.ownerId, thread.id), allowedMentions: pingOwner });
  } catch (err) {
    log("Couldn't ping in new post", thread.id, String(err));
  }
});

// ---- @Meowdere mark as <tag> ----

client.on(Events.MessageCreate, async (msg) => {
  const me = client.user;
  if (!me || msg.author.bot || !msg.inGuild()) return;
  await onOwnerPing(msg).catch((err) => log("Owner-ping check failed:", String(err)));
  // A real @mention in the text, not a reply that happens to ping her.
  const mention = new RegExp(`<@!?${me.id}>`, "g");
  if (!mention.test(msg.content)) return;
  try {
    await handleCommand(msg, msg.content.replace(mention, ""));
  } catch (err) {
    log("Command failed:", String(err));
  }
});

// ---- pinging the owner ----

/**
 * Someone pinged the owner: a short timeout, no ladder, and the message
 * stays. She answers with the owner's name, which never pings them.
 *
 * Mentions come with every message even without the Message Content intent,
 * so this needs no privileged intent. A reply to the owner's own message is
 * left alone: Discord pings on reply by default, and that's not on purpose.
 */
async function onOwnerPing(msg: Message<true>) {
  if (msg.author.id === config.ownerId || !msg.mentions.users.has(config.ownerId)) return;
  if (msg.reference && msg.mentions.repliedUser?.id === config.ownerId) return;
  // Moderators can ping freely.
  if (msg.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

  const seconds = config.ownerPingTimeoutSeconds;
  let timedOut = false;
  if (seconds > 0 && msg.member?.moderatable) {
    try {
      await msg.member.timeout(seconds * 1000, "Pinged the owner (Meowdere)");
      timedOut = true;
    } catch (err) {
      log("Couldn't time out", msg.author.id, String(err));
    }
  }
  await msg.reply({ content: voice.ownerBusy(config.ownerId, timedOut ? seconds : 0), allowedMentions: { parse: [], repliedUser: false } });
}

async function handleCommand(msg: Message<true>, text: string) {
  const reply = (content: string) => msg.reply({ content, allowedMentions: { ...pingNobody, repliedUser: false } });
  const cmds = parseCommands(text);
  if (cmds.length === 0 || cmds.some((c) => c.kind === "help")) return reply(voice.help());

  const thread = msg.channel;
  if (!thread.isThread() || thread.parent?.type !== ChannelType.GuildForum) return reply(voice.notForum());
  const forum = thread.parent;
  const tags: Tag[] = forum.availableTags.map((t) => ({ id: t.id, name: t.name }));
  if (cmds.every((c) => c.kind === "tags")) return reply(voice.tags(tags.map((t) => t.name)));

  const allowed = msg.author.id === config.ownerId || msg.member?.permissionsIn(thread).has(PermissionFlagsBits.ManageThreads);
  if (!allowed) return reply(voice.notAllowed());

  // Every action is worked out first and applied in one edit, so a message
  // like "mark as bug and unmark as new" is all or nothing.
  const plan = planTags(thread.appliedTags, cmds, tags);
  if ("error" in plan) return reply(plan.error);
  if (plan.next.length > 5) return reply(voice.tooManyTags());

  const changed = plan.added.length > 0 || plan.removed.length > 0;
  if (!changed && !plan.lock) {
    // Nothing to do: say why, in the words of the one action if there was one.
    const only = cmds.length === 1 ? cmds[0] : null;
    if (only?.kind === "mark") return reply(voice.alreadyMarked(only.names));
    if (only?.kind === "unmark") return reply(voice.notMarked(only.names));
    return reply(voice.nothingChanged());
  }
  if (changed) {
    try {
      await thread.setAppliedTags(plan.next);
    } catch {
      return reply(voice.cantEdit());
    }
  }

  // She replies before locking so her message lands in an open post.
  const clearedAll = cmds.length === 1 && cmds[0].kind === "unmarkAll";
  await reply(voice.changed(plan.added.map((t) => t.name), plan.removed.map((t) => t.name), plan.lock?.name ?? null, clearedAll));
  if (plan.lock) {
    try {
      await thread.setLocked(true, `Marked ${plan.lock.name} by ${msg.author.tag}`);
    } catch {
      await reply(voice.cantEdit());
    }
  }
}

// ---- start ----

client.once(Events.ClientReady, async (c) => {
  log(`Logged in as ${c.user.tag}, nya~ Watching ${config.repos.map((r) => r.repo).join(", ")}`);
  try {
    await changelogChannel();
  } catch (err) {
    log(String(err));
  }
  await pollAll();
  setInterval(pollAll, config.pollSeconds * 1000);
});

client.login(config.token);
