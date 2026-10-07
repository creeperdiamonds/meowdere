import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepo } from "../src/config.ts";
import { newSince, type Commit } from "../src/github.ts";
import { commitList, releasedTitle, shipped, unreleasedBody } from "../src/changelog.ts";
import { matchTag, parseCommand } from "../src/commands.ts";
import { pick, voice } from "../src/voice.ts";

const c = (sha: string, title = `Commit ${sha}`): Commit => ({ sha, title, author: "creeperdiamonds", url: `https://github.com/x/y/commit/${sha}` });

test("repo specs: branch and workflow are optional", () => {
  assert.deepEqual(parseRepo("creeperdiamonds/appealy@main:deploy-merged.yml"), { repo: "creeperdiamonds/appealy", branch: "main", deployWorkflow: "deploy-merged.yml" });
  assert.deepEqual(parseRepo("a/b"), { repo: "a/b", branch: "main", deployWorkflow: null });
  assert.deepEqual(parseRepo("a/b:ci.yml"), { repo: "a/b", branch: "main", deployWorkflow: "ci.yml" });
  assert.throws(() => parseRepo("nope"));
});

test("new commits come back oldest first, stopping at the last seen", () => {
  const newestFirst = [c("d"), c("c"), c("b"), c("a")];
  assert.deepEqual(newSince(newestFirst, "b").map((x) => x.sha), ["c", "d"]);
  assert.deepEqual(newSince(newestFirst, "d"), []);
  assert.equal(newSince(newestFirst, "gone").length, 4, "a force-push treats everything listed as new");
});

test("a deploy ships pending commits up to its head, and keeps the rest", () => {
  const pending = [c("a"), c("b"), c("c")];
  assert.deepEqual(shipped(pending, "b").shipped.map((x) => x.sha), ["a", "b"]);
  assert.deepEqual(shipped(pending, "b").left.map((x) => x.sha), ["c"]);
  assert.deepEqual(shipped(pending, "zzz"), { shipped: [], left: pending });
});

test("long changelogs fit in one Discord message", () => {
  const many = Array.from({ length: 200 }, (_, i) => c(`${i}`.padStart(7, "0"), "A fairly long commit title that goes on for a while"));
  const body = unreleasedBody("hi", "a/b", "main", many);
  assert.ok(body.length <= 2000, `${body.length} chars`);
  assert.match(commitList(many), /…and \d+ more\./);
  assert.match(commitList([]), /redeploy/);
});

test("release titles name the newest change and fit Discord's 100", () => {
  const title = releasedTitle("creeperdiamonds/appealy", [c("a", "First"), c("b", "Show form descriptions")], new Date("2026-10-07T12:00:00Z"));
  assert.equal(title, "appealy · 7 Oct 2026 · Show form descriptions (+1)");
  assert.ok(releasedTitle("a/b", [c("a", "x".repeat(300))], new Date()).length <= 100);
});

test("commands: mark, unmark, several tags, and help for anything else", () => {
  assert.deepEqual(parseCommand(" mark as Fixed "), { kind: "mark", names: ["Fixed"] });
  assert.deepEqual(parseCommand("mark bug, high priority"), { kind: "mark", names: ["bug", "high priority"] });
  assert.deepEqual(parseCommand("unmark as fixed"), { kind: "unmark", names: ["fixed"] });
  assert.deepEqual(parseCommand("unmark"), { kind: "unmarkAll" });
  assert.deepEqual(parseCommand("tags"), { kind: "tags" });
  assert.deepEqual(parseCommand("hello!"), { kind: "help" });
});

test("tag names match loosely but never guess between two", () => {
  const tags = [{ id: "1", name: "✅ Fixed" }, { id: "2", name: "Bug" }, { id: "3", name: "Bug (minor)" }, { id: "4", name: "Won't fix" }];
  assert.deepEqual(matchTag("fixed", tags), { tag: tags[0] });
  assert.deepEqual(matchTag("BUG", tags), { tag: tags[1] }, "an exact name beats a longer one");
  assert.deepEqual(matchTag("wont", tags), { tag: tags[3] });
  assert.ok("error" in matchTag("nope", tags));
  assert.ok("error" in matchTag("", tags));
});

test("Meowdere always pings the owner in what she posts", () => {
  for (let i = 0; i < 10; i++) {
    for (const line of [voice.unreleasedIntro("42"), voice.deployed("42"), voice.newPost("42"), voice.deployFailed("42", 1, "u")]) {
      assert.match(line, /<@42>/);
    }
  }
  assert.equal(pick(["a", "b"], () => 0.99), "b");
  assert.equal(voice.marked(["Bug", "High"]), "✨ Marked as **Bug** and **High**, nya~");
});
