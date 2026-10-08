// src/commands.ts
//
// "@Meowdere mark as <tag>" and friends: reading the words, and matching a
// typed name to one of the forum's tags. No Discord here either.

export type Command =
  | { kind: "mark"; names: string[]; lock?: boolean }
  | { kind: "unmark"; names: string[] }
  | { kind: "unmarkAll" }
  | { kind: "tags" }
  | { kind: "help" };

/** The text after the mention. Several tags may be given, split by commas. */
export function parseCommand(text: string): Command {
  const t = text.trim().replace(/\s+/g, " ");
  const names = (s: string) => s.split(",").map((n) => n.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  // "@Meowdere fixed" / "@Meowdere completed": the everyday cases, short
  // enough to type in passing. They close the post too: tagged and locked.
  if (/^fixed[.!~]*$/i.test(t)) return { kind: "mark", names: ["Fixed"], lock: true };
  if (/^complete[d]?[.!~]*$/i.test(t)) return { kind: "mark", names: ["Completed"], lock: true };
  let m = t.match(/^mark(?: as)? (.+)$/i);
  if (m) return { kind: "mark", names: names(m[1]) };
  if (/^(unmark|clear)( all)?$/i.test(t)) return { kind: "unmarkAll" };
  m = t.match(/^unmark(?: as)? (.+)$/i);
  if (m) return { kind: "unmark", names: names(m[1]) };
  if (/^tags?$/i.test(t)) return { kind: "tags" };
  return { kind: "help" };
}

/**
 * Several actions in one message: "mark as bug and unmark as new",
 * "unmark question then fixed". Split only where "and", "then", ";" or a new
 * line comes right before another action, so a tag called "Q and A" stays whole.
 */
export function parseCommands(text: string): Command[] {
  const verb = String.raw`(?:mark|unmark|clear|fixed|completed?)\b`;
  return text
    .split(new RegExp(String.raw`\s*(?:;|\n|,?\s+(?:and|then)\s+)\s*(?=${verb})`, "i"))
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseCommand);
}

export interface TagPlan {
  /** The post's tags once every action is applied, in order. */
  next: string[];
  added: Tag[];
  removed: Tag[];
  /** The tag a closing action (fixed, completed) named, if the post should be locked. */
  lock: Tag | null;
}

/**
 * Applies the actions, left to right, to the post's current tags. The net
 * change is what counts: "mark as a and unmark as a" changes nothing.
 */
export function planTags(current: string[], commands: Command[], tags: Tag[]): TagPlan | { error: string } {
  let next = [...current];
  let lock: Tag | null = null;
  for (const cmd of commands) {
    if (cmd.kind === "tags" || cmd.kind === "help") continue;
    if (cmd.kind === "unmarkAll") {
      next = [];
      continue;
    }
    for (const name of cmd.names) {
      const found = matchTag(name, tags);
      if ("error" in found) return found;
      const id = found.tag.id;
      if (cmd.kind === "mark") {
        if (!next.includes(id)) next.push(id);
        if (cmd.lock) lock ??= found.tag;
      } else {
        next = next.filter((t) => t !== id);
      }
    }
  }
  const byId = (id: string) => tags.find((t) => t.id === id) ?? { id, name: id };
  return {
    next,
    added: next.filter((id) => !current.includes(id)).map(byId),
    removed: current.filter((id) => !next.includes(id)).map(byId),
    lock,
  };
}

export interface Tag {
  id: string;
  name: string;
}

/** Lower case, with emoji and punctuation dropped, so "✅ Fixed" matches "fixed". */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

/** An exact name wins; otherwise a unique prefix does. */
export function matchTag(name: string, tags: Tag[]): { tag: Tag } | { error: string } {
  const want = norm(name);
  const exact = tags.find((t) => norm(t.name) === want);
  if (exact) return { tag: exact };
  const close = tags.filter((t) => norm(t.name).startsWith(want));
  if (want && close.length === 1) return { tag: close[0] };
  if (close.length > 1) return { error: `"${name}" could be ${close.map((t) => `**${t.name}**`).join(" or ")}.` };
  return { error: `No tag called "${name}". This forum has: ${tags.map((t) => `**${t.name}**`).join(", ") || "no tags"}.` };
}
