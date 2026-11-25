import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { Item, Layout, Sync } from '../types'
import { collect, emptySeen, withRoles } from './collect'
import { fetchItems } from './github'
import type { Fetched } from './github'
import { byActivity, isActive, tree } from './layout'
import type { Row } from './layout'

const PANE = 'trail'
const TITLE = 'Trail'

const layout = atom({ plugin: 'trail', key: 'layout' } as const, 'grouped' as Layout, {
  shape: 'layout-1',
})
const items$ = atom({ plugin: 'trail', key: 'items' } as const, [] as Item[], { shape: 'items-1' })
const sync$ = atom({ plugin: 'trail', key: 'sync' } as const, { at: 0, isBusy: false } as Sync, {
  shape: 'sync-1',
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

// GitHub is asked again about the open items this often, and at the end of
// a turn when the last look is older than TURN_STALE_MS.
const REFRESH_MS = 3 * 60_000
const TURN_STALE_MS = 60_000

// The module's own memory of the transcript and of GitHub's answers. A
// reload starts it over: the transcript is read again and the answers are
// seeded from the items the pane last drew.
let seen = emptySeen()
let cursor: string | undefined
const fetched = new Map<string, Fetched>()
let lastActive = 0
let queue: Promise<void> = Promise.resolve()

async function scan($: EngineInterface) {
  const rows = await $.session.messages(cursor === undefined ? { last: 4096 } : { after: cursor })
  if ('deny' in rows) {
    // The row read from is gone (a compaction, a rewind): read it all again.
    seen = emptySeen()
    cursor = undefined
    const all = await $.session.messages({ last: 4096 })
    if ('deny' in all) return
    collect(seen, all)
    cursor = all.at(-1)?.uuid
    return
  }
  collect(seen, rows)
  cursor = rows.at(-1)?.uuid ?? cursor
}

// Reads what the transcript added, asks GitHub about what is new to it (and
// about the open items when `refresh` says so), and redraws.
function sync($: EngineInterface, refresh: 'new' | 'stale' | 'all') {
  queue = queue.then(async () => {
    await scan($)
    const now = await $.clock.now()
    const isActiveDue = refresh === 'all' || (refresh === 'stale' && now - lastActive > TURN_STALE_MS)
    const want = seen.order.filter(key => {
      const known = fetched.get(key)
      return known === undefined || (isActiveDue && isActive({ ...known, role: 'mentioned' }))
    })
    if (want.length > 0) {
      await update($, sync$, now => ({ ...now, isBusy: true }))
      const got = await fetchItems($, want)
      for (const [key, item] of got.items) fetched.set(key, item)
      if (isActiveDue) lastActive = now
      await update($, sync$, () => ({ at: Date.now(), isBusy: false, error: got.error }))
    }
    await update($, items$, () => withRoles(seen, fetched))
  }).catch(async (cause: unknown) => {
    await update($, sync$, now => ({ ...now, isBusy: false, error: String(cause) }))
  })
  return queue
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trail',
      description: 'Show the GitHub issues and pull requests of this session (args: refresh | grouped | flat)',
    })
    for (const item of await read($, items$)) {
      const { role: _, ...rest } = item
      fetched.set(item.key, rest)
    }
    $.clock.every(REFRESH_MS, () => void sync($, 'all'))
    void sync($, 'all')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) void sync($, 'stale')
    return next(e)
  })

  on('command.run', { command: 'trail' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'grouped' || arg === 'flat') await update($, layout, () => arg)
    await $.ui.open({ id: PANE, title: TITLE })
    if (arg === 'refresh') {
      await sync($, 'all')
      return { text: 'Trail refreshed.' }
    }
    return { text: 'Trail pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link, Button } = $.ui.resolve(e)
    const mode = await read($, layout)
    const withMentioned = await read($, showMentioned)
    const items = await read($, items$)
    const state = await read($, sync$)

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
          {/* A terminal Claude Code finds no hyperlinks in draws the URL after
              the text; cut there, so the columns hold either way. */}
          <Box flexShrink={0} width={refWidth + 1} overflow="hidden">
            <Text wrap="truncate-end" dimColor={isDone || !isOwn}>
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

    // Every title starts in one column: the widest reference, indent
    // included, across all the rows drawn.
    const columnOf = (rows: Row[], fullRepo: boolean) =>
      Math.max(0, ...rows.map(r => r.depth * 2 + refOf(r.item, fullRepo).length))
    const block = (rows: Row[], fullRepo: boolean, column: number) =>
      rows.map(r => row(r.item, r.depth, fullRepo, column - r.depth * 2))

    const sections = tree(items, withMentioned)
    const groupedColumn = columnOf(sections.flatMap(section => section.rows), false)
    const flatRows: Row[] = items
      .filter(item => withMentioned || item.role !== 'mentioned')
      .sort(byActivity)
      .map(item => ({ item, depth: 0 }))

    const toggle = () => update($, showMentioned, now => !now)
    const clock = (at: number) => {
      const d = new Date(at)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    const synced = state.isBusy ? 'syncing…' : state.at > 0 ? `synced ${clock(state.at)}` : ''
    const header = (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>
            {created.length} opened here ({created.filter(isActive).length} open) · {focus.length} focus
            {hidden > 0 ? ` · ${hidden} hidden` : ''}
          </Text>
          <Box columnGap={2}>
            <Text dimColor>{synced}</Text>
            <Button plain dimColor onPress={() => sync($, 'all')}>
              refresh
            </Button>
            <Button
              plain
              dimColor
              onPress={() => update($, layout, now => (now === 'grouped' ? 'flat' : 'grouped'))}
            >
              {mode === 'grouped' ? 'flat' : 'grouped'}
            </Button>
          </Box>
        </Box>
        {state.error !== undefined && (
          <Text color="error" wrap="truncate-end">
            gh: {state.error}
          </Text>
        )}
      </Box>
    )

    const body =
      mode === 'grouped' ? (
        sections.map(section => (
          <Box key={section.title ?? 'created'} flexDirection="column" marginTop={1}>
            {section.title && (
              <Text bold dimColor>
                {section.title}
              </Text>
            )}
            {block(section.rows, false, groupedColumn)}
          </Box>
        ))
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {block(flatRows, true, columnOf(flatRows, true))}
        </Box>
      )

    const mentioned = items.length - created.length - focus.length
    return (
      <Box flexDirection="column">
        {header}
        {items.length === 0 ? (
          <Box marginTop={1}>
            <Text dimColor>
              {state.isBusy ? 'Looking the session up on GitHub…' : 'No GitHub issues or pull requests in this session yet.'}
            </Text>
          </Box>
        ) : (
          body
        )}
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
