# claude-trail

A Claude Code mod that keeps a pane of the GitHub issues and pull requests a session touched, with their state: open, draft, merged or closed, and for an open pull request its CI, whether it can be merged, and its review.

Work that starts from an issue and ends in several pull requests leaves them spread over sessions. The pane answers which pull requests this session opened, for which issue, and which of them still need you.

```
6 opened here (3 open) · 2 focus · 12 hidden              synced 20:14  refresh  flat

opened here
● planning#42        Let small teams sign in with their own identity provider
  ◌ PR web#318       Add the identity provider settings page   ● CI blocked review
  ● PR api#1207      Accept SAML assertions from any provider  ✗ CI conflict review
  ◆ PR api#1199      Store each team's identity provider
  ◆ PR docs#88       Document single sign-on for small teams
● planning#45        Sign-in fails when the provider's clock is ahead

focus
● api#1180           Rework how sessions are issued
◆ PR web#301         Split the settings pages by team

12 mentioned hidden show

● open ◌ draft ◆ merged ✕ closed · dim: not opened here
```

## Install

```sh
claude plugin marketplace add babarot/claude-trail
claude plugin install trail@claude-trail
```

Then start a new session, or run `/reload-plugins` in one, and open the pane with `/trail`.

It needs:

- A Claude Code version with mods (TypeScript plugin hooks), in the terminal: the mod runs `gh`, which only the CLI can. Tested with Claude Code 2.1.332 on macOS.
- [gh](https://cli.github.com/), signed in to github.com with access to the repositories the session works in.

## What it shows

Every `https://github.com/<owner>/<repo>/pull/<n>` and `/issues/<n>` URL in the session's transcript is listed, in one of three sections:

| Section | What goes in it |
| --- | --- |
| opened here | What the session opened: a URL printed by a `gh pr create` or `gh issue create` it ran |
| focus | What the work is about: a URL in your own prompt, or an issue or pull request the body of a pull request opened here refers to |
| mentioned | Everything else: URLs that only appeared in Claude's replies or a tool's output. Hidden until you press `show` |

A pull request goes under the issue its body refers to (`Part of owner/repo#123`, a full URL, or `#123` in its own repository), even when the issue lives in another repository. When the body names several, the first one opened here wins, then the first one in focus. An issue with a pull request opened here under it sits in "opened here", whatever brought the issue in.

Within a section, open and draft items come first, then the newest. `flat` lists everything on one level with the owner in each reference. The `#123` of each row is a link.

## Keeping it current

- At the end of each turn, new URLs are looked up, and open items again when the last look is over a minute old.
- Every three minutes, open items are looked up again.
- `refresh` in the pane, or `/trail refresh`, looks everything up now.

All items go to GitHub in one GraphQL query per 40 through `gh api graphql`. A repository `gh` cannot read is left out of the pane; when `gh` fails as a whole, the pane says why under its header.

## Links in a terminal multiplexer

Claude Code draws a link as an OSC 8 hyperlink only in terminals it recognizes, by `TERM_PROGRAM`. A multiplexer that sets its own `TERM_PROGRAM` (herdr, for one) is not on that list, and Claude Code then draws the text followed by the URL; the pane cuts the URL off so its columns stay. When the multiplexer and the terminal behind it pass OSC 8 through, set `FORCE_HYPERLINK=1` inside it, for example in `~/.zshrc`:

```sh
[[ $TERM_PROGRAM == herdr ]] && export FORCE_HYPERLINK=1
```

## Limits

- Pull requests a subagent opens are not seen as opened here: only the main conversation's transcript is read.
- A pull request opened some other way than `gh pr create` (a GitHub MCP tool, the web) counts as mentioned, or as focus when you paste its URL.
- github.com only; GitHub Enterprise Server URLs are not collected.
- The list is the session's own: it is rebuilt from the transcript when the session resumes, and is not shared across sessions.

## Develop

```sh
git clone https://github.com/babarot/claude-trail
cd claude-trail
claude --plugin-dir "$PWD"
claude plugin validate .
claude plugin test .
```

- [hooks/collect.ts](./hooks/collect.ts) reads the transcript and a body's references
- [hooks/github.ts](./hooks/github.ts) asks GitHub through `gh`
- [hooks/layout.ts](./hooks/layout.ts) arranges the items into sections
- [hooks/register.tsx](./hooks/register.tsx) wires the hooks and draws the pane

The editor types live in `.claude-plugin/types/`. Claude Code generates them when it loads the mod, and they are not committed.

Releases are made with [tagpr](https://github.com/Songmu/tagpr). Merging its release PR bumps `version` in `.claude-plugin/plugin.json`, which is what makes `claude plugin update` pick up the new version, then tags `vX.Y.Z` and publishes a GitHub Release. Label a PR `kind/feature` or `kind/deprecation` for a minor release, `kind/breaking-change` for a major one.

## License

MIT
