import type { Item } from '../types'

export const isActive = (item: Item) => item.state === 'open' || item.state === 'draft'

// Open and draft first, then newest first.
export const byActivity = (a: Item, b: Item) =>
  Number(isActive(b)) - Number(isActive(a)) || b.number - a.number

export type Row = { item: Item; depth: number }
export type Section = { title?: string; rows: Row[] }

// The items as the pane draws them: each issue the session opened or works
// on, with the pull requests whose bodies refer to it beneath it, then what
// hangs under no issue. Mentioned items show only when asked for.
export function tree(items: Item[], withMentioned: boolean): Section[] {
  const shown = items.filter(item => withMentioned || item.role !== 'mentioned').sort(byActivity)
  const parents = new Map(
    shown
      .filter(item => item.kind === 'issue' && item.role !== 'mentioned')
      .map(item => [item.key, item]),
  )

  // A pull request goes under the first issue its body names that the
  // session opened, else the first one it works on.
  const parentOf = (pr: Item): Item | undefined => {
    const named = (pr.refs ?? []).flatMap(key => parents.get(key) ?? [])
    return named.find(issue => issue.role === 'created') ?? named[0]
  }
  const children = new Map<string, Item[]>()
  const loose: Item[] = []
  for (const item of shown) {
    if (parents.has(item.key)) continue
    const parent = item.kind === 'pr' ? parentOf(item) : undefined
    if (parent) children.set(parent.key, [...(children.get(parent.key) ?? []), item])
    else loose.push(item)
  }

  // An issue sits with the work done for it: in "opened here" once a pull
  // request opened here hangs under it, whatever brought the issue in.
  const placeOf = (issue: Item): Item['role'] =>
    (children.get(issue.key) ?? []).some(child => child.role === 'created') ? 'created' : issue.role

  const section = (role: Item['role'], title?: string): Section => {
    const rows: Row[] = []
    for (const issue of parents.values()) {
      if (placeOf(issue) !== role) continue
      rows.push({ item: issue, depth: 0 })
      for (const child of children.get(issue.key) ?? []) rows.push({ item: child, depth: 1 })
    }
    for (const item of loose) if (item.role === role) rows.push({ item, depth: 0 })
    return { title, rows }
  }

  return [section('created', 'opened here'), section('focus', 'focus'), section('mentioned', 'mentioned')].filter(
    one => one.rows.length > 0,
  )
}
