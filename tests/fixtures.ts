import type { Item } from '../types'

// Made-up items covering the states the pane has to show.
const gh = (repo: string, kind: 'issues' | 'pull', number: number) =>
  `https://github.com/${repo}/${kind}/${number}`

const raw: Omit<Item, 'key'>[] = [
  {
    kind: 'issue', repo: 'babarot/api', number: 120, state: 'open', role: 'focus',
    title: 'Login times out behind the corporate proxy', url: gh('babarot/api', 'issues', 120),
  },
  {
    kind: 'pr', repo: 'babarot/api', number: 131, state: 'open', role: 'created',
    title: 'Raise the login timeout and retry once', url: gh('babarot/api', 'pull', 131),
    checks: 'pass', mergeable: 'clean', review: 'approved', refs: ['babarot/api#120'],
  },
  {
    kind: 'pr', repo: 'babarot/api', number: 132, state: 'open', role: 'created',
    title: 'Read the proxy settings from the environment as well as the config file so that people behind a proxy do not have to set it twice',
    url: gh('babarot/api', 'pull', 132),
    checks: 'fail', mergeable: 'conflict', review: 'required', refs: ['babarot/api#120'],
  },
  {
    kind: 'issue', repo: 'babarot/api', number: 118, state: 'closed', role: 'created',
    title: 'Document the proxy settings', url: gh('babarot/api', 'issues', 118),
  },
  {
    kind: 'pr', repo: 'babarot/api', number: 125, state: 'merged', role: 'created',
    title: 'Document the proxy settings', url: gh('babarot/api', 'pull', 125),
    checks: 'pass', mergeable: 'unknown', review: 'approved', refs: ['babarot/api#118'],
  },
  {
    kind: 'pr', repo: 'babarot/dotfiles', number: 410, state: 'draft', role: 'created',
    title: 'Add claude-trail to the Claude Code plugins', url: gh('babarot/dotfiles', 'pull', 410),
    checks: 'pending', mergeable: 'blocked', review: 'none',
  },
  {
    kind: 'pr', repo: 'cli/cli', number: 9876, state: 'closed', role: 'mentioned',
    title: 'Support --json for gh pr checks', url: gh('cli/cli', 'pull', 9876),
    checks: 'none', mergeable: 'unknown', review: 'changes',
  },
  {
    kind: 'issue', repo: 'babarot/gomi', number: 77, state: 'open', role: 'mentioned',
    title: 'Restore keeps the original permissions', url: gh('babarot/gomi', 'issues', 77),
  },
]

export const fixtures: Item[] = raw.map(item => ({ ...item, key: `${item.repo}#${item.number}` }))
