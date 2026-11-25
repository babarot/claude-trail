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
      .map(item => [item.url, item]),
  )

  // A pull request goes under the first issue its body names that the
  // session opened, else the first one it works on.
  const parentOf = (pr: Item): Item | undefined => {
    const named = (pr.refs ?? []).flatMap(url => parents.get(url) ?? [])
    return named.find(issue => issue.role === 'created') ?? named[0]
  }
  const children = new Map<string, Item[]>()
  const loose: Item[] = []
  for (const item of shown) {
    if (parents.has(item.url)) continue
    const parent = item.kind === 'pr' ? parentOf(item) : undefined
    if (parent) children.set(parent.url, [...(children.get(parent.url) ?? []), item])
    else loose.push(item)
  }

  const section = (role: Item['role'], title?: string): Section => {
    const rows: Row[] = []
    for (const issue of parents.values()) {
      if (issue.role !== role) continue
      rows.push({ item: issue, depth: 0 })
      for (const child of children.get(issue.url) ?? []) rows.push({ item: child, depth: 1 })
    }
    for (const item of loose) if (item.role === role) rows.push({ item, depth: 0 })
    return { title, rows }
  }

  return [section('created'), section('focus', 'focus'), section('mentioned', 'mentioned')].filter(
    one => one.rows.length > 0,
  )
}
