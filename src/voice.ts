// src/voice.ts
//
// Everything Meowdere says, in one place. She's deredere: openly sweet,
// cheerful and proud of you, with a little cat in her. Keep lines short; the
// changelog itself is the point, she just wraps it.

/** One of several lines, so she doesn't sound like a template. */
export function pick(lines: string[], rand: () => number = Math.random): string {
  return lines[Math.floor(rand() * lines.length)];
}

export const voice = {
  unreleasedIntro: (owner: string) =>
    pick([
      `<@${owner}> nya~ you pushed something! I'm keeping it all safe right here until it ships 💕`,
      `<@${owner}> new commits! I started a little list for you, nya~ ✨`,
      `<@${owner}> ooh, you've been busy! I'll hold onto these until they're deployed 🐾`,
    ]),
  morePushed: (n: number) =>
    pick([
      `➕ ${n} more commit${n === 1 ? "" : "s"}! You're on a roll, nya~`,
      `➕ ${n} new commit${n === 1 ? "" : "s"} added to the list 🐾`,
      `➕ ${n} more! I'm so proud of you 💕`,
    ]),
  deployed: (owner: string) =>
    pick([
      `<@${owner}> 🚀 It's live!! Everything below shipped, nya~ I knew you could do it 💕`,
      `<@${owner}> 🚀 Deployed! Look at all this you made ✨`,
      `<@${owner}> 🚀 Shipped! *happy purring* 🐾`,
    ]),
  redeployed: (owner: string) => `<@${owner}> 🚀 Redeployed, nya~ Nothing new this time, but it's all fresh and running 💕`,
  deployFailed: (owner: string, run: number, url: string) =>
    pick([
      `<@${owner}> 😿 Deploy [#${run}](<${url}>) didn't make it… it's okay! Your commits are still here, waiting for the next try 💕`,
      `<@${owner}> 😿 Oh no, deploy [#${run}](<${url}>) failed. I'm right here, let's fix it together nya~`,
    ]),
  newPost: (owner: string) =>
    pick([
      `<@${owner}> nya~ someone made a new post! Come look 🐾`,
      `<@${owner}> a new post just appeared! I flagged it for you 💕`,
    ]),

  marked: (tags: string[]) => `✨ Marked as ${list(tags)}, nya~`,
  unmarked: (tags: string[]) => `🧹 Took off ${list(tags)} for you 💕`,
  unmarkedAll: () => `🧹 All tags off, squeaky clean, nya~`,
  alreadyMarked: (tags: string[]) => `It's already marked as ${list(tags)}, silly 💕`,
  notMarked: (tags: string[]) => `It wasn't marked as ${list(tags)} to begin with, nya~`,
  tooManyTags: () => `😿 A post can only wear 5 tags at once! Take one off first?`,
  tags: (names: string[]) => (names.length ? `This forum's tags: ${list(names)} 🐾` : `This forum doesn't have any tags yet, nya~`),
  notForum: () => `I can only tag posts inside a forum, nya~ 🐾`,
  notAllowed: () => `Sorry~ only people who can manage threads get to change tags 💕`,
  cantEdit: () => `😿 I'm not allowed to edit this post. Could someone give me **Manage Threads** here?`,
  help: () =>
    [
      "Hiii, I'm **Meowdere**! 💕 In a forum post you can say:",
      "`@Meowdere mark as <tag>`: I'll add it (several: `mark as bug, urgent`)",
      "`@Meowdere unmark <tag>`: I'll take it off",
      "`@Meowdere unmark`: I'll take every tag off",
      "`@Meowdere tags`: I'll list this forum's tags",
    ].join("\n"),
};

function list(names: string[]): string {
  const bold = names.map((n) => `**${n}**`);
  return bold.length <= 1 ? bold.join("") : `${bold.slice(0, -1).join(", ")} and ${bold.at(-1)}`;
}
