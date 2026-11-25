import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { Item, Layout } from '../types'
import { fixtures } from './fixtures'
import { byActivity, isActive, tree } from './layout'
import type { Row } from './layout'

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

    const created = items.filter(item => item.role === 'created')
    const focus = items.filter(item => item.role === 'focus')
    const hidden = withMentioned ? 0 : items.filter(item => item.role === 'mentioned').length

    const refOf = (item: Item, fullRepo: boolean) =>
      `${item.kind === 'pr' ? 'PR ' : ''}${fullRepo ? item.repo : item.repo.split('/')[1]}#${item.number}`

    const row = (item: Item, depth: number, fullRepo: boolean, refWidth: number) => {
      const state = STATE[item.state]
      const isDone = !isActive(item)
      const isOwn = item.role === 'created'
      const checks = CHECKS[item.checks ?? 'none']
      const mergeable = MERGEABLE[item.mergeable ?? 'unknown']
      const review = REVIEW[item.review ?? 'none']
      return (
        <Box key={item.url} flexDirection="row" paddingLeft={depth * 2}>
          <Box flexShrink={0} width={2}>
            <Text color={state.color}>{state.glyph}</Text>
          </Box>
          <Box flexShrink={0} width={refWidth + 1}>
            <Text dimColor={isDone || !isOwn}>
              <Link href={item.url}>{refOf(item, fullRepo)}</Link>
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={8}>
            <Text wrap="truncate-end" dimColor={isDone || !isOwn}>
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

    // Rows at one depth of one block share a width for the reference, so
    // their titles line up.
    const block = (rows: Row[], fullRepo: boolean) => {
      const width = (depth: number) =>
        Math.max(0, ...rows.filter(r => r.depth === depth).map(r => refOf(r.item, fullRepo).length))
      const widths = [width(0), width(1)]
      return rows.map(r => row(r.item, r.depth, fullRepo, widths[r.depth] ?? 0))
    }

    const toggle = () => update($, showMentioned, now => !now)
    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>
          {created.length} opened here ({created.filter(isActive).length} open) · {focus.length} focus
          {hidden > 0 ? ` · ${hidden} hidden` : ''}
        </Text>
        <Button
          plain
          dimColor
          onPress={() => update($, layout, now => (now === 'grouped' ? 'flat' : 'grouped'))}
        >
          {mode === 'grouped' ? 'flat' : 'grouped'}
        </Button>
      </Box>
    )

    const body =
      mode === 'grouped' ? (
        tree(items, withMentioned).map(section => (
          <Box key={section.title ?? 'created'} flexDirection="column" marginTop={1}>
            {section.title && (
              <Text bold dimColor>
                {section.title}
              </Text>
            )}
            {block(section.rows, false)}
          </Box>
        ))
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {block(
            items
              .filter(item => withMentioned || item.role !== 'mentioned')
              .sort(byActivity)
              .map(item => ({ item, depth: 0 })),
            true,
          )}
        </Box>
      )

    const mentioned = items.length - created.length - focus.length
    return (
      <Box flexDirection="column">
        {header}
        {body}
        {mentioned > 0 && (
          <Box marginTop={1} columnGap={1}>
            <Text dimColor>
              {withMentioned ? `${mentioned} mentioned shown` : `${mentioned} mentioned hidden`}
            </Text>
            <Button plain onPress={toggle}>
              {withMentioned ? 'hide' : 'show'}
            </Button>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>● open ◌ draft ◆ merged ✕ closed · dim: not opened here</Text>
        </Box>
      </Box>
    )
  })
}
