import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { Item, Layout } from '../types'
import { fixtures } from './fixtures'

const PANE = 'trail'
const TITLE = 'Trail'

const layout = atom({ plugin: 'trail', key: 'layout' } as const, 'grouped' as Layout, {
  shape: 'layout-1',
})
const showMentioned = atom({ plugin: 'trail', key: 'showMentioned' } as const, false, {
  shape: 'show-mentioned-1',
})

const STATE: Record<Item['state'], { glyph: string; color: Color }> = {
  open: { glyph: '●', color: 'success' },
  draft: { glyph: '◌', color: 'inactive' },
  merged: { glyph: '◆', color: 'merged' },
  closed: { glyph: '✕', color: 'error' },
}

const CHECKS = {
  pass: { text: '✓ CI', color: 'success' },
  fail: { text: '✗ CI', color: 'error' },
  pending: { text: '● CI', color: 'warning' },
  none: { text: '  ', color: 'inactive' },
} satisfies Record<NonNullable<Item['checks']>, { text: string; color: Color }>

const MERGEABLE = {
  clean: { text: 'mergeable', color: 'success' },
  conflict: { text: 'conflict', color: 'error' },
  blocked: { text: 'blocked', color: 'warning' },
  unknown: { text: '', color: 'inactive' },
} satisfies Record<NonNullable<Item['mergeable']>, { text: string; color: Color }>

const REVIEW = {
  approved: { text: 'approved', color: 'success' },
  changes: { text: 'changes', color: 'error' },
  required: { text: 'review', color: 'warning' },
  none: { text: '', color: 'inactive' },
} satisfies Record<NonNullable<Item['review']>, { text: string; color: Color }>

// A repository's items: each issue followed by the pull requests that close
// it, then the pull requests that close none of the listed issues.
type Group = { repo: string; rows: { item: Item; depth: number }[] }

function group(items: Item[]): Group[] {
  const repos = [...new Set(items.map(item => item.repo))]
  return repos.map(repo => {
    const mine = items.filter(item => item.repo === repo)
    const issues = mine.filter(item => item.kind === 'issue')
    const listed = new Set(issues.map(issue => issue.number))
    const rows: Group['rows'] = []
    for (const issue of issues) {
      rows.push({ item: issue, depth: 0 })
      for (const pr of mine) {
        if (pr.kind === 'pr' && pr.closes?.includes(issue.number)) rows.push({ item: pr, depth: 1 })
      }
    }
    for (const pr of mine) {
      if (pr.kind === 'pr' && !pr.closes?.some(n => listed.has(n))) rows.push({ item: pr, depth: 0 })
    }
    return { repo, rows }
  })
}

// A local file of real items, kept out of git, stands in for the made-up
// ones while the layout is worked out. Read once per load of the module.
let loaded: Item[] | undefined
async function loadFixtures($: EngineInterface): Promise<Item[]> {
  if (loaded) return loaded
  try {
    loaded = JSON.parse(await $.fs.read(`${$.plugin.root}/fixtures.local.json`)) as Item[]
  } catch {
    loaded = fixtures
  }
  return loaded
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trail',
      description: 'Show the GitHub issues and pull requests of this session (args: grouped | flat)',
    })
    return next(e)
  })

  on('command.run', { command: 'trail' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'grouped' || arg === 'flat') await update($, layout, () => arg)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Trail pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link, Button } = $.ui.resolve(e)
    const mode = await read($, layout)
    const withMentioned = await read($, showMentioned)
    const items = await loadFixtures($)

    const isActive = (item: Item) => item.state === 'open' || item.state === 'draft'
    // Open and draft first, then newest first.
    const sorted = [...items].sort(
      (a, b) => Number(isActive(b)) - Number(isActive(a)) || b.number - a.number,
    )
    const created = sorted.filter(item => item.isCreated)
    const mentioned = sorted.filter(item => !item.isCreated)
    const shown = withMentioned ? sorted : created

    const row = (item: Item, depth: number, showRepo: boolean, refWidth: number) => {
      const state = STATE[item.state]
      const ref = `${item.kind === 'pr' ? 'PR ' : ''}${showRepo ? item.repo : ''}#${item.number}`
      const isDone = !isActive(item)
      const checks = CHECKS[item.checks ?? 'none']
      const mergeable = MERGEABLE[item.mergeable ?? 'unknown']
      const review = REVIEW[item.review ?? 'none']
      return (
        <Box key={item.url} flexDirection="row" paddingLeft={depth * 2}>
          <Box flexShrink={0} width={2}>
            <Text color={state.color}>{state.glyph}</Text>
          </Box>
          <Box flexShrink={0} width={refWidth + 1}>
            <Text dimColor={isDone}>
              <Link href={item.url}>{ref}</Link>
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={8}>
            <Text wrap="truncate-end" dimColor={isDone || !item.isCreated}>
              {item.title}
            </Text>
          </Box>
          {item.kind === 'pr' && !isDone && (
            <Box flexShrink={0} columnGap={1} marginLeft={1}>
              <Text color={checks.color}>{checks.text}</Text>
              {mergeable.text !== '' && <Text color={mergeable.color}>{mergeable.text}</Text>}
              {review.text !== '' && <Text color={review.color}>{review.text}</Text>}
            </Box>
          )}
        </Box>
      )
    }
    const refOf = (item: Item, showRepo: boolean) =>
      (item.kind === 'pr' ? 3 : 0) + (showRepo ? item.repo.length : 0) + 1 + String(item.number).length
    const widest = (list: Item[], showRepo: boolean) =>
      Math.max(0, ...list.map(item => refOf(item, showRepo)))

    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>
          {created.length} opened here ({created.filter(isActive).length} open)
          {mentioned.length > 0 ? ` · ${mentioned.length} mentioned` : ''}
        </Text>
        <Box columnGap={2}>
          {mentioned.length > 0 && (
            <Button plain dimColor onPress={() => update($, showMentioned, now => !now)}>
              {withMentioned ? 'hide mentioned' : 'show mentioned'}
            </Button>
          )}
          <Button
            plain
            dimColor
            onPress={() => update($, layout, now => (now === 'grouped' ? 'flat' : 'grouped'))}
          >
            {mode === 'grouped' ? 'flat' : 'grouped'}
          </Button>
        </Box>
      </Box>
    )

    const body =
      mode === 'grouped' ? (
        group(shown).map(g => {
          const width = widest(g.rows.map(r => r.item), false)
          return (
            <Box key={g.repo} flexDirection="column" marginTop={1}>
              <Text bold>{g.repo}</Text>
              {g.rows.map(r => row(r.item, r.depth, false, width))}
            </Box>
          )
        })
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {shown.map(item => row(item, 0, true, widest(shown, true)))}
        </Box>
      )

    return (
      <Box flexDirection="column">
        {header}
        {body}
        <Box marginTop={1}>
          <Text dimColor>● open ◌ draft ◆ merged ✕ closed  · dim: mentioned, not opened here</Text>
        </Box>
      </Box>
    )
  })
}
