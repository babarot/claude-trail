import { atom, read, update } from 'claude-code'
import type { Color, Register } from 'claude-code'

import type { Item, Layout } from '../types'
import { fixtures } from './fixtures'

const PANE = 'trail'
const TITLE = 'Trail'

const layout = atom({ plugin: 'trail', key: 'layout' } as const, 'grouped' as Layout, {
  shape: 'layout-1',
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
    const items = fixtures

    const row = (item: Item, depth: number, showRepo: boolean) => {
      const state = STATE[item.state]
      const ref = `${showRepo ? item.repo : ''}#${item.number}`
      const isPr = item.kind === 'pr'
      return (
        <Box key={item.url} flexDirection="row" paddingLeft={depth * 2} columnGap={1}>
          <Text color={state.color}>{depth > 0 ? '└' : ''}{state.glyph}</Text>
          <Box flexShrink={0}>
            <Text>
              <Link href={item.url}>{isPr ? `PR ${ref}` : ref}</Link>
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={8}>
            <Text wrap="truncate-end" dimColor={item.state === 'closed' || item.state === 'merged'}>
              {item.title}
            </Text>
          </Box>
          {isPr && (
            <Box flexShrink={0} columnGap={1}>
              <Text color={CHECKS[item.checks ?? 'none'].color}>{CHECKS[item.checks ?? 'none'].text}</Text>
              {item.state === 'open' && MERGEABLE[item.mergeable ?? 'unknown'].text !== '' && (
                <Text color={MERGEABLE[item.mergeable ?? 'unknown'].color}>
                  {MERGEABLE[item.mergeable ?? 'unknown'].text}
                </Text>
              )}
              {item.state === 'open' && REVIEW[item.review ?? 'none'].text !== '' && (
                <Text color={REVIEW[item.review ?? 'none'].color}>{REVIEW[item.review ?? 'none'].text}</Text>
              )}
            </Box>
          )}
          <Box flexShrink={0} width={1}>
            <Text color="claude">{item.isCreated ? '+' : ' '}</Text>
          </Box>
        </Box>
      )
    }

    const prs = items.filter(item => item.kind === 'pr').length
    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>
          {prs} PRs · {items.length - prs} issues · {items.filter(i => i.isCreated).length} opened here
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
        group(items).map(g => (
          <Box key={g.repo} flexDirection="column" marginTop={1}>
            <Text bold>{g.repo}</Text>
            {g.rows.map(r => row(r.item, r.depth, false))}
          </Box>
        ))
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {items.map(item => row(item, 0, true))}
        </Box>
      )

    return (
      <Box flexDirection="column">
        {header}
        {body}
        <Box marginTop={1}>
          <Text dimColor>● open ◌ draft ◆ merged ✕ closed  + opened in this session</Text>
        </Box>
      </Box>
    )
  })
}
