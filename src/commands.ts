// src/commands.ts
//
// "@Meowdere mark as <tag>" and friends: reading the words, and matching a
// typed name to one of the forum's tags. No Discord here either.

export type Command =
  | { kind: "mark"; names: string[] }
  | { kind: "unmark"; names: string[] }
  | { kind: "unmarkAll" }
  | { kind: "tags" }
  | { kind: "help" };

/** The text after the mention. Several tags may be given, split by commas. */
export function parseCommand(text: string): Command {
  const t = text.trim().replace(/\s+/g, " ");
  const names = (s: string) => s.split(",").map((n) => n.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  let m = t.match(/^mark(?: as)? (.+)$/i);
  if (m) return { kind: "mark", names: names(m[1]) };
  if (/^(unmark|clear)( all)?$/i.test(t)) return { kind: "unmarkAll" };
  m = t.match(/^unmark(?: as)? (.+)$/i);
  if (m) return { kind: "unmark", names: names(m[1]) };
  if (/^tags?$/i.test(t)) return { kind: "tags" };
  return { kind: "help" };
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
