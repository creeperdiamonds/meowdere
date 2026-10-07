# Meowdere

A sweet little Discord bot, nya~ She watches your GitHub repos and writes
changelogs for you, pings you when someone opens a forum post, and tags
posts when you ask her to.

## What she does

- **Changelogs.** New commits on the tracked branch go into one **Unreleased**
  message in your changelog channel, which she keeps up to date as you push.
  When the deploy workflow succeeds, that message becomes the release's
  changelog and she replies to it, pinging you. If a deploy fails she tells
  you, and the commits wait for the next one.
- **New posts.** Every new post in the forums you list (a bug-reports forum,
  say) pings you.
- **Fixed, from a commit.** Put `fixes #<post ID>` in a commit message (her
  ping on each new post shows the exact line). When that commit is deployed,
  she tags the post **Fixed** and tells whoever opened it that it's live.
- **Pinging the owner.** Anyone who pings you gets a short timeout (a minute by
  default, no escalation) and a gentle reply: "<you> may be busy right now.
  Please be patient". Their message isn't deleted, and her reply shows your name
  without pinging you. Replies to your messages and people with Timeout Members
  are left alone.
- **Tags.** In any forum post:
  - `@Meowdere fixed` to tag it **Fixed**
  - `@Meowdere mark as <tag>` (several at once: `mark as bug, urgent`)
  - `@Meowdere unmark <tag>`, or `@Meowdere unmark` to remove them all
  - `@Meowdere tags` to list the forum's tags

  Only the owner and people with Manage Threads can change tags.

She checks GitHub once a minute through its API, so she needs no public URL or
webhook and runs fine on a home PC.

## Setup

You need Node 23.6 or newer. She runs TypeScript directly, with no build step.

1. In the [Discord Developer Portal](https://discord.com/developers/applications),
   create an application. Under **Bot**, reset the token and copy it. She needs
   no privileged intents.
2. Invite her (replace `APP_ID`):
   `https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot&permissions=1391569472512`
   (View Channels, Send Messages, Send Messages in Threads, Read Message
   History, Manage Threads, Timeout Members. Her role must sit above the
   people she should be able to time out.)
3. Copy `.env.example` to `.env` and put in your Discord token and a GitHub token
   that can read the repos (for example, `gh auth token`).
4. Copy `meowdere.config.example.json` to `meowdere.config.json` and fill it in:

   | Setting | What it is |
   | --- | --- |
   | `ownerId` | Your Discord user ID: the person she pings |
   | `changelogChannelId` | The text channel changelogs go to |
   | `watchForumIds` | Forums where new posts ping you |
   | `repos` | Each repo, its `branch` (default `main`) and its `deployWorkflow` file. Leave the workflow out to track commits only. |
   | `ownerPingTimeoutSeconds` | How long pinging you times someone out (default 60, max 600, 0 turns it off) |
   | `pollSeconds` | How often to check GitHub (default 60, minimum 30) |

   To copy IDs, turn on Developer Mode in Discord, then right-click → Copy ID.
5. `npm install`, then `npm start`.

On the first start she only notes where each repo is. She won't post its history.

## Development

- `npm test`: the changelog, config, command and tag-matching logic
- `npm run check`: type-check
- Everything she says is in `src/voice.ts`.
