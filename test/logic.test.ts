import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/config.ts";
import { fixesIn, newSince, type Commit } from "../src/github.ts";
import { commitList, releasedBody, shipped, unreleasedBody } from "../src/changelog.ts";
import { matchTag, parseCommand } from "../src/commands.ts";
import { pick, voice } from "../src/voice.ts";

const c = (sha: string, title = `Commit ${sha}`): Commit => ({ sha, title, author: "creeperdiamonds", url: `https://github.com/x/y/commit/${sha}`, fixes: [] });

const env = { DISCORD_TOKEN: "t", GITHUB_TOKEN: "g" };
const id = "123456789012345678";

test("config: defaults filled in, mistakes caught at startup", () => {
  const cfg = parseConfig({ ownerId: id, changelogChannelId: id, watchForumIds: [id], repos: [{ repo: "a/b" }] }, env);
  assert.deepEqual(cfg.repos, [{ repo: "a/b", branch: "main", deployWorkflow: null }]);
  assert.equal(cfg.pollSeconds, 60);
  assert.throws(() => parseConfig({ ownerId: 123, changelogChannelId: id, repos: [{ repo: "a/b" }] }, env), /ownerId/);
  assert.throws(() => parseConfig({ ownerId: id, changelogChannelId: id, repos: [] }, env), /repos/);
  assert.throws(() => parseConfig({ ownerId: id, changelogChannelId: id, repos: [{ repo: "nope" }] }, env), /owner\/name/);
  assert.throws(() => parseConfig({ ownerId: id, changelogChannelId: id, repos: [{ repo: "a/b" }] }, {}), /DISCORD_TOKEN/);
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

test("a release is headed with the repo and date", () => {
  const body = releasedBody("Shipped!", "creeperdiamonds/appealy", [c("a", "Show form descriptions")], 93, "u", new Date("2026-10-07T12:00:00Z"));
  assert.ok(body.startsWith("## appealy · 7 Oct 2026\nShipped! Deployed in [run #93]"), body);
  assert.match(body, /Show form descriptions/);
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

test("Meowdere pings the owner on deploys and new posts, and keeps emoji rare", () => {
  for (let i = 0; i < 10; i++) {
    for (const line of [voice.deployed("42"), voice.newPost("42", "1"), voice.deployFailed("42", 1, "u")]) {
      assert.match(line, /<@42>/);
    }
  }
  assert.equal(pick(["a", "b"], () => 0.99), "b");
  assert.equal(voice.marked(["Bug", "High"]), "Marked as **Bug** and **High**, nya~");
  for (let i = 0; i < 20; i++) assert.doesNotMatch(voice.unreleasedIntro(), /<@/, "a push alone doesn't ping");
});

test("commits name the posts they fix, by Discord post ID only", () => {
  const msg = "Fix the checkout button\n\nFixes #1425012345678901234, closes #1425012345678901999.\nAlso see #12 and fixes #1425012345678901234";
  assert.deepEqual(fixesIn(msg), ["1425012345678901234", "1425012345678901999"]);
  assert.deepEqual(fixesIn("fix #42"), [], "a GitHub issue number isn't a post");
  assert.deepEqual(fixesIn("Resolved: #1425012345678901234"), ["1425012345678901234"]);
});

test("@Meowdere fixed tags the post Fixed and locks it", () => {
  assert.deepEqual(parseCommand("fixed"), { kind: "mark", names: ["Fixed"], lock: true });
  assert.deepEqual(parseCommand("Fixed!"), { kind: "mark", names: ["Fixed"], lock: true });
});

test("owner pings: a short timeout by default, never a ping back", () => {
  const base = { ownerId: id, changelogChannelId: id, repos: [{ repo: "a/b" }] };
  assert.equal(parseConfig(base, env).ownerPingTimeoutSeconds, 60);
  assert.equal(parseConfig({ ...base, ownerPingTimeoutSeconds: 0 }, env).ownerPingTimeoutSeconds, 0, "0 turns it off");
  assert.equal(parseConfig({ ...base, ownerPingTimeoutSeconds: 99999 }, env).ownerPingTimeoutSeconds, 600, "capped at 10 minutes");
  assert.match(voice.ownerBusy("42", 60), /<@42> .*busy/s);
  assert.match(voice.ownerBusy("42", 60), /1-minute timeout/);
  assert.doesNotMatch(voice.ownerBusy("42", 0), /timeout/, "no timeout, no mention of one");
});
