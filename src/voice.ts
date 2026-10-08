// src/voice.ts
//
// Everything Meowdere says, in one place. She's deredere: openly sweet,
// cheerful and proud of you, with a little cat in her. Keep lines short and
// emoji rare; the changelog itself is the point, she just wraps it.

/** One of several lines, so she doesn't sound like a template. */
export function pick(lines: string[], rand: () => number = Math.random): string {
  return lines[Math.floor(rand() * lines.length)];
}

export const voice = {
  unreleasedIntro: () =>
    pick([
      "Nya~ you pushed something! I'm keeping it all safe here until it ships.",
      "New commits! I started a little list for you, nya~",
      "Ooh, you've been busy! I'll hold onto these until they're deployed.",
    ]),
  shippedIntro: () => "Shipped with love, nya~",
  deployed: (owner: string) =>
    pick([
      `<@${owner}> It's live!! Everything here shipped. I knew you could do it 💕`,
      `<@${owner}> Deployed! Look at all this you made, nya~`,
      `<@${owner}> Shipped! *happy purring*`,
    ]),
  redeployed: (owner: string) => `<@${owner}> Redeployed, nya~ Nothing new this time, but it's all fresh and running.`,
  deployFailed: (owner: string, run: number, url: string) =>
    pick([
      `<@${owner}> Deploy [#${run}](<${url}>) didn't make it… it's okay! Your commits are still here for the next try.`,
      `<@${owner}> Oh no, deploy [#${run}](<${url}>) failed. I'm right here, let's fix it together, nya~`,
    ]),
  newPost: (owner: string, postId: string) =>
    pick([
      `<@${owner}> Nya~ someone made a new post! Come look.`,
      `<@${owner}> A new post just appeared, I saved it for you 💕`,
    ]) + `\n-# Put \`fixes #${postId}\` in a commit and I'll mark this Fixed when it ships.`,
  /** In the post, once the commit that fixes it is deployed. Pings whoever opened it. */
  fixShipped: (reporter: string | null, sha: string, url: string) =>
    `${reporter ? `<@${reporter}> ` : ""}Good news, nya~ This was fixed in [\`${sha.slice(0, 7)}\`](<${url}>) and it's live now. Thank you for reporting it 💕`,
  /** Said to someone who pinged the owner. The owner's mention is shown but never pings. */
  ownerBusy: (owner: string, seconds: number) =>
    pick([
      `<@${owner}> may be busy right now. Please be patient, they'll get to you, nya~`,
      `Shh~ <@${owner}> might be busy. Please be patient, they'll see your message.`,
      `<@${owner}> may be busy, so no need to ping. Please be patient~`,
    ]) + (seconds ? `\n-# Pinging them gets a little ${duration(seconds)} timeout. Your message stays right here.` : ""),

  marked: (tags: string[]) => `Marked as ${list(tags)}, nya~`,
  closedLocked: (tag: string) => `Marked as **${tag}** and locked. All done here, nya~`,
  unmarked: (tags: string[]) => `Took off ${list(tags)} for you.`,
  unmarkedAll: () => "All tags off, squeaky clean, nya~",
  alreadyMarked: (tags: string[]) => `It's already marked as ${list(tags)}, silly.`,
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
  tooManyTags: () => "A post can only wear 5 tags at once! Take one off first?",
  tags: (names: string[]) => (names.length ? `This forum's tags: ${list(names)}` : "This forum doesn't have any tags yet, nya~"),
  notForum: () => "I can only tag posts inside a forum, nya~",
  notAllowed: () => "Sorry~ only people who can manage threads get to change tags.",
  cantEdit: () => "I'm not allowed to edit this post… could someone give me **Manage Threads** here?",
  help: () =>
    [
      "Hiii, I'm **Meowdere**! In a forum post you can say:",
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
