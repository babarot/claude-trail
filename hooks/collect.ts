import type { SessionMessage } from 'claude-code'

import type { Item, Role } from '../types'

// What the transcript says about each issue and pull request in it, by key.
export type Seen = {
  // Every key in the order it first appeared.
  order: string[]
  // Printed by a `gh pr create` or `gh issue create` the session ran.
  created: Set<string>
  // Written in the person's own prompt.
  prompted: Set<string>
}

export const emptySeen = (): Seen => ({ order: [], created: new Set(), prompted: new Set() })

const URL_RE = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:pull|issues)\/(\d+)/g
const CREATE_RE = /\bgh\s+(?:pr|issue)\s+create\b/

export const keyOf = (repo: string, number: number) => `${repo}#${number}`

export function keysIn(text: string): string[] {
  return [...text.matchAll(URL_RE)].map(m => keyOf(`${m[1]}/${m[2]}`, Number(m[3])))
}

// The text of a user message that the person typed: what the engine adds to a
// user turn (reminders, a skill's body, a command's wrapper) left out.
export function promptText(text: string): string {
  if (text.startsWith('Base directory for this skill:')) return ''
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<(command-[\w-]+|local-command-[\w-]+|task-notification)>[\s\S]*?<\/\1>/g, '')
}

function note(seen: Seen, keys: string[]) {
  const known = new Set(seen.order)
  for (const key of keys) {
    if (known.has(key)) continue
    known.add(key)
    seen.order.push(key)
  }
}

// Adds what these messages show to `seen`.
export function collect(seen: Seen, messages: readonly SessionMessage[]): Seen {
  for (const message of messages) {
    if (message.role === 'user') {
      const typed = keysIn(promptText(message.text))
      for (const key of typed) seen.prompted.add(key)
      note(seen, typed)
      for (const result of message.toolResults ?? []) note(seen, keysIn(result.text))
      continue
    }
    note(seen, keysIn(message.text))
    for (const use of message.toolUses) {
      note(seen, keysIn(JSON.stringify(use.input)))
      const output = use.text ?? ''
      note(seen, keysIn(output))
      const command = use.input['command']
      if (use.tool === 'Bash' && typeof command === 'string' && CREATE_RE.test(command)) {
        for (const key of keysIn(output)) seen.created.add(key)
      }
    }
  }
  return seen
}

// The keys a body refers to, in order: full URLs, `owner/repo#123`, and a
// bare `#123`, read as the body's own repository's.
export function refsIn(body: string, repo: string): string[] {
  const hits: { at: number; key: string }[] = []
  for (const m of body.matchAll(URL_RE)) hits.push({ at: m.index, key: keyOf(`${m[1]}/${m[2]}`, Number(m[3])) })
  for (const m of body.matchAll(/(?<![\w/])([\w.-]+\/[\w.-]+)#(\d+)\b/g)) {
    hits.push({ at: m.index, key: keyOf(m[1]!, Number(m[2])) })
  }
  for (const m of body.matchAll(/(?<![\w/#])#(\d+)\b/g)) hits.push({ at: m.index, key: keyOf(repo, Number(m[1])) })
  return [...new Set(hits.sort((a, b) => a.at - b.at).map(hit => hit.key))]
}

// Each item's role: opened here; else in the person's prompt or named by the
// body of a pull request opened here; else only mentioned.
export function withRoles(seen: Seen, fetched: ReadonlyMap<string, Omit<Item, 'role'>>): Item[] {
  const focus = new Set(seen.prompted)
  for (const key of seen.created) for (const ref of fetched.get(key)?.refs ?? []) focus.add(ref)
  const roleOf = (key: string): Role =>
    seen.created.has(key) ? 'created' : focus.has(key) ? 'focus' : 'mentioned'
  return seen.order.flatMap(key => {
    const item = fetched.get(key)
    return item ? [{ ...item, role: roleOf(key) }] : []
  })
}
