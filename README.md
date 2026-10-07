# Meowdere 💕

A sweet little Discord bot, nya~ She watches your GitHub repos and turns commits
and deploys into forum changelogs, pings you on new forum posts, and tags posts
when you ask her to.

## What she does

- **Changelogs.** New commits on the tracked branch go into an **Unreleased** post
  in your changelog forum, and she keeps that list up to date as you push. When the
  deploy workflow succeeds, the post becomes the release: renamed, tagged
  **Deployed**, you're pinged, and it's archived. A failed deploy pings you in the
  same post and tags it **Deploy failed**.
- **New posts.** Every new post in the forums you list in `WATCH_FORUM_IDS` pings you.
- **Tags.** In any forum post:
  - `@Meowdere mark as <tag>` (several at once: `mark as bug, urgent`)
  - `@Meowdere unmark <tag>`, or `@Meowdere unmark` to remove them all
  - `@Meowdere tags` to list the forum's tags

  Only you and people with Manage Threads can change tags.

She checks GitHub once a minute through its API, so she needs no public URL or
webhook. She can run on any PC.

## Setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications),
   create an application named **Meowdere**. Under **Bot**, reset the token and
   copy it. She needs no privileged intents.
2. Invite her (replace `APP_ID`):
   `https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot&permissions=292057844752`
   (View Channels, Send Messages, Send Messages in Threads, Read Message History,
   Manage Threads, Manage Channels; Manage Channels is only used once, to add the
   changelog tags to the forum).
3. `cp .env.example .env` and fill it in.
4. `npm install`, then `npm start`.

On the first start she only notes where each repo is. She won't post its history.

## Development

- `npm test`: the changelog, command and tag-matching logic
- `npm run check`: type-check
- What she says lives in `src/voice.ts`.
