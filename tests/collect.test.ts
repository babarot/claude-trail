import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { collect, emptySeen, promptText, refsIn, withRoles } from '../hooks/collect'
import type { Fetched } from '../hooks/github'
import { tree } from '../hooks/layout'

const URL = (repo: string, kind: 'pull' | 'issues', n: number) => `https://github.com/${repo}/${kind}/${n}`

const user = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const assistant = (text: string, toolUses: SessionMessage['toolUses'] = []): SessionMessage => ({
  role: 'assistant',
  text,
  toolUses,
})
const bash = (command: string, output: string) => ({
  tool_use_id: command,
  tool: 'Bash',
  input: { command },
  text: output,
})

test('a URL printed by gh pr create is created, one in a prompt is prompted', async () => {
  const seen = collect(emptySeen(), [
    user(`Work on ${URL('o/app', 'issues', 1)} please`),
    assistant(`Background: ${URL('o/app', 'pull', 7)}`, [
      bash('gh pr create --fill', `${URL('o/app', 'pull', 9)}\n`),
      bash('gh pr view 7', URL('o/app', 'pull', 7)),
    ]),
  ])
  expect(seen.order).toEqual(['o/app#1', 'o/app#7', 'o/app#9'])
  expect([...seen.created]).toEqual(['o/app#9'])
  expect([...seen.prompted]).toEqual(['o/app#1'])
})

test('what the engine adds to a user turn is not the person typing', async () => {
  expect(promptText(`<system-reminder>${URL('o/app', 'pull', 3)}</system-reminder>hi`)).toBe('hi')
  expect(promptText(`Base directory for this skill: /x\n${URL('o/app', 'pull', 3)}`)).toBe('')
})

test('a body refers by URL, owner/repo#n and a bare #n of its own repository, in order', async () => {
  const body = `Part of o/issues#14500. Follows #12 and ${URL('o/lib', 'pull', 5)}. Not a#b#1.`
  expect(refsIn(body, 'o/app')).toEqual(['o/issues#14500', 'o/app#12', 'o/lib#5'])
})

test('a pull request opened here goes under the issue its body names, across repositories', async () => {
  const seen = collect(emptySeen(), [
    user(`${URL('o/issues', 'issues', 100)}`),
    assistant('', [bash('gh pr create', URL('o/app', 'pull', 9))]),
    assistant(`See ${URL('o/app', 'pull', 2)}`),
  ])
  const fetched = new Map<string, Fetched>([
    ['o/issues#100', { key: 'o/issues#100', kind: 'issue', repo: 'o/issues', number: 100, title: 'Goal', url: URL('o/issues', 'issues', 100), state: 'open' }],
    ['o/app#9', { key: 'o/app#9', kind: 'pr', repo: 'o/app', number: 9, title: 'Fix', url: URL('o/app', 'pull', 9), state: 'open', refs: ['o/issues#100'] }],
    ['o/app#2', { key: 'o/app#2', kind: 'pr', repo: 'o/app', number: 2, title: 'Old', url: URL('o/app', 'pull', 2), state: 'merged' }],
  ])
  const items = withRoles(seen, fetched)
  expect(items.map(item => [item.key, item.role])).toEqual([
    ['o/issues#100', 'focus'],
    ['o/app#9', 'created'],
    ['o/app#2', 'mentioned'],
  ])

  const shown = tree(items, false).map(s => [s.title, s.rows.map(r => `${r.depth}:${r.item.key}`)])
  expect(shown).toEqual([
    ['opened here', ['0:o/issues#100', '1:o/app#9']],
  ])
})
