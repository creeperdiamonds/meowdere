// src/voice.ts
//
// Everything Meowdere says, in one place. She's deredere: openly, endlessly
// sweet, cheerful and devoted, proud of you whatever happens, with a little
// cat in her (nya~, purring). Keep lines short and emoji rare: a ♡ now and
// then, not confetti. The changelog itself is the point; she just wraps it.
//
// Who hears what matters. A released changelog is published to every server
// that follows the changelog channel, so shippedIntro stays sweet but fine for
// strangers. The adoring, just-for-you lines are for the owner's own server.

/** One of several lines, so she doesn't sound like a template. */
export function pick(lines: string[], rand: () => number = Math.random): string {
  return lines[Math.floor(rand() * lines.length)];
}

const sha7 = (sha: string, url: string) => `[\`${sha.slice(0, 7)}\`](<${url}>)`;

export const voice = {
  unreleasedIntro: () =>
    pick([
      "Nya~ you pushed something! I'm keeping it all safe here until it ships ♡",
      "Ehehe, new commits! I started a little list, just for you.",
      "You've been working so hard~ I'll hold onto these until they're live.",
      "*purrs* More work from you? I'll guard it right here until it ships.",
    ]),
  /** Published to every following server: sweet, but for anyone. */
  shippedIntro: () =>
    pick([
      "Shipped with love, nya~",
      "Fresh out of the oven, nya~ ♡",
      "New and improved, made with care~",
      "All wrapped up with a little bow, nya~",
    ]),
  deployed: (owner: string) =>
    pick([
      `<@${owner}> It's live!! Everything here shipped. I knew you could do it ♡`,
      `<@${owner}> Deployed! Look at all this you made~ I'm so proud of you, nya~`,
      `<@${owner}> Shipped! *happy purring* You're amazing, you know that?`,
      `<@${owner}> All live now~ Go take a little break, you earned it ♡`,
    ]),
  redeployed: (owner: string) =>
    pick([
      `<@${owner}> Redeployed, nya~ Nothing new this time, but it's all fresh and running.`,
      `<@${owner}> A fresh redeploy~ Same code, all shiny and running again ♡`,
    ]),
  deployFailed: (owner: string, run: number, url: string) =>
    pick([
      `<@${owner}> Deploy [#${run}](<${url}>) didn't make it… it's okay! Your commits are still here for the next try ♡`,
      `<@${owner}> Oh no, deploy [#${run}](<${url}>) failed. I'm right here, let's fix it together, nya~`,
      `<@${owner}> Deploy [#${run}](<${url}>) tripped… *nuzzles* You'll get it next time, I believe in you.`,
    ]),
  newPost: (owner: string, postId: string) =>
    pick([
      `<@${owner}> Nya~ someone made a new post! Come look~`,
      `<@${owner}> A new post just appeared, I saved it for you ♡`,
      `<@${owner}> Someone needs you~ there's a new post waiting!`,
    ]) + `\n-# Put \`fixes #${postId}\` in a commit and I'll mark this Fixed when it ships.`,
  /** In the post, once the commit that fixes it is deployed. Pings whoever opened it. */
  fixShipped: (reporter: string | null, sha: string, url: string) =>
    (reporter ? `<@${reporter}> ` : "") +
    pick([
      `Good news, nya~ This was fixed in ${sha7(sha, url)} and it's live now. Thank you so much for reporting it ♡`,
      `It's fixed~ ${sha7(sha, url)} is live now. Thank you for helping, you're the best, nya~`,
    ]),
  /** Said to someone who pinged the owner. The owner's mention is shown but never pings. */
  ownerBusy: (owner: string, seconds: number) =>
    pick([
      `<@${owner}> may be busy right now. Please be patient, they'll get to you, nya~`,
      `Shh~ <@${owner}> might be busy. Please be patient, they'll see your message ♡`,
      `<@${owner}> may be busy, so no need to ping. Please be patient~ I'll keep you company!`,
    ]) + (seconds ? `\n-# Pinging them gets a little ${duration(seconds)} timeout. Your message stays right here.` : ""),

  marked: (tags: string[]) =>
    pick([`Marked as ${list(tags)}, nya~`, `There you go~ marked as ${list(tags)}!`, `Done! It's wearing ${list(tags)} now ♡`]),
  closedLocked: (tag: string) =>
    pick([
      `Marked as **${tag}** and locked. All done here, nya~`,
      `**${tag}** and locked~ Another one finished, good job ♡`,
    ]),
  unmarked: (tags: string[]) => pick([`Took off ${list(tags)} for you.`, `${list(tags)} is off now, nya~`]),
  unmarkedAll: () => pick(["All tags off, squeaky clean, nya~", "Every tag off~ fresh as new ♡"]),
  alreadyMarked: (tags: string[]) => `It's already marked as ${list(tags)}, silly~`,
  notMarked: (tags: string[]) => `It wasn't marked as ${list(tags)} to begin with, nya~`,
  nothingChanged: () => "That all cancels out, so nothing changed, nya~",
  /** What a tag command did, in one reply. Single actions keep their own lines. */
  changed(added: string[], removed: string[], locked: string | null, clearedAll: boolean): string {
    if (locked && removed.length === 0 && added.every((t) => t === locked)) return voice.closedLocked(locked);
    if (!locked && clearedAll) return voice.unmarkedAll();
    if (!locked && removed.length === 0) return voice.marked(added);
    if (!locked && added.length === 0) return voice.unmarked(removed);
    const parts = [
      added.length ? `marked as ${list(added)}` : null,
      removed.length ? `took off ${list(removed)}` : null,
      locked ? "locked it" : null,
    ].filter(Boolean) as string[];
    const said = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
    return `${said[0].toUpperCase()}${said.slice(1)}${locked ? ". All done here" : ""}, nya~`;
  },
  tooManyTags: () => "A post can only wear 5 tags at once! Take one off first? ♡",
  tags: (names: string[]) => (names.length ? `This forum's tags: ${list(names)}` : "This forum doesn't have any tags yet, nya~"),
  notForum: () => "I can only tag posts inside a forum, nya~",
  notAllowed: () => "Sorry~ only people who can manage threads get to change tags. I still like you though ♡",
  cantEdit: () => "I'm not allowed to edit this post… could someone give me **Manage Threads** here? Pretty please?",
  help: () =>
    [
      "Hiii, I'm **Meowdere**! ♡ I'm always happy to help~ In a forum post you can say:",
      "`@Meowdere fixed`: I'll tag it **Fixed** and lock it",
      "`@Meowdere completed`: I'll tag it **Completed** and lock it",
      "`@Meowdere mark as <tag>`: I'll add it (several: `mark as bug, urgent`)",
      "`@Meowdere unmark <tag>`: I'll take it off",
      "`@Meowdere unmark`: I'll take every tag off",
      "`@Meowdere tags`: I'll list this forum's tags",
      "Do several at once with *and*: `mark as bug and unmark as new`",
    ].join("\n"),
};

/** 60 → "1-minute", 30 → "30-second". */
function duration(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60}-minute` : `${seconds}-second`;
}

function list(names: string[]): string {
  const bold = names.map((n) => `**${n}**`);
  return bold.length <= 1 ? bold.join("") : `${bold.slice(0, -1).join(", ")} and ${bold.at(-1)}`;
}
