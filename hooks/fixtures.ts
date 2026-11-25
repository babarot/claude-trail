import type { Item } from '../types'

// Made-up items covering the states the pane has to show, used while the
// layout is worked out. Replaced by what the session collects later.
const gh = (repo: string, kind: 'issues' | 'pull', number: number) =>
  `https://github.com/${repo}/${kind}/${number}`

export const fixtures: Item[] = [
  {
    kind: 'issue', repo: 'babarot/api', number: 120, state: 'open', isCreated: false,
    title: 'Login times out behind the corporate proxy', url: gh('babarot/api', 'issues', 120),
  },
  {
    kind: 'pr', repo: 'babarot/api', number: 131, state: 'open', isCreated: true,
    title: 'Raise the login timeout and retry once', url: gh('babarot/api', 'pull', 131),
    checks: 'pass', mergeable: 'clean', review: 'approved', closes: [120],
  },
  {
    kind: 'pr', repo: 'babarot/api', number: 132, state: 'open', isCreated: true,
    title: 'Read the proxy settings from the environment as well as the config file so that people behind a proxy do not have to set it twice',
    url: gh('babarot/api', 'pull', 132),
    checks: 'fail', mergeable: 'conflict', review: 'required', closes: [120],
  },
  {
    kind: 'issue', repo: 'babarot/api', number: 118, state: 'closed', isCreated: true,
    title: 'Document the proxy settings', url: gh('babarot/api', 'issues', 118),
  },
  {
    kind: 'pr', repo: 'babarot/api', number: 125, state: 'merged', isCreated: true,
    title: 'Document the proxy settings', url: gh('babarot/api', 'pull', 125),
    checks: 'pass', mergeable: 'unknown', review: 'approved', closes: [118],
  },
  {
    kind: 'pr', repo: 'babarot/dotfiles', number: 410, state: 'draft', isCreated: true,
    title: 'Add claude-trail to the Claude Code plugins', url: gh('babarot/dotfiles', 'pull', 410),
    checks: 'pending', mergeable: 'blocked', review: 'none',
  },
  {
    kind: 'pr', repo: 'cli/cli', number: 9876, state: 'closed', isCreated: false,
    title: 'Support --json for gh pr checks', url: gh('cli/cli', 'pull', 9876),
    checks: 'none', mergeable: 'unknown', review: 'changes',
  },
  {
    kind: 'issue', repo: 'babarot/gomi', number: 77, state: 'open', isCreated: false,
    title: 'Restore keeps the original permissions', url: gh('babarot/gomi', 'issues', 77),
  },
]
