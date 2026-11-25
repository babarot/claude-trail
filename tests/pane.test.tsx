import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'trail',
  component: 'Pane',
  requestId: 'trail',
  props: {
    title: 'Trail',
    isFocused: false,
    bodyColumns: 120,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const PR = 'https://github.com/o/app/pull/9'
const ISSUE = 'https://github.com/o/issues/issues/100'

test('the pane shows a pull request opened here under its issue, with its checks', async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'trail' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: `Fix ${ISSUE}`, toolUses: [], uuid: 'u1' },
      {
        role: 'assistant',
        text: '',
        uuid: 'a1',
        toolUses: [{ tool_use_id: 't1', tool: 'Bash', input: { command: 'gh pr create --fill' }, text: PR }],
      },
    ],
  }))
  let asked = ''
  on('process.run', (_, e) => {
    asked = e.argv.join(' ')
    return {
      value: {
        exitCode: 0,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
        stdout: JSON.stringify({
          data: {
            i0: { issueOrPullRequest: { __typename: 'Issue', title: 'The goal', url: ISSUE, state: 'OPEN' } },
            i1: {
              issueOrPullRequest: {
                __typename: 'PullRequest',
                title: 'Do the thing',
                url: PR,
                state: 'OPEN',
                isDraft: false,
                mergeable: 'CONFLICTING',
                mergeStateStatus: 'DIRTY',
                reviewDecision: 'REVIEW_REQUIRED',
                body: 'Part of o/issues#100',
                commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
              },
            },
          },
        }),
      },
    }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'trail',
    args: 'refresh',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(asked).toContain('gh api graphql')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /opened here \(1 open\)/ }))?.text).toBeDefined()
    expect((await ui.find({ type: 'Text', text: 'The goal' }))?.text).toBe('The goal')
    expect((await ui.find({ type: 'Text', text: '✗ CI' }))?.text).toBe('✗ CI')
    expect((await ui.find({ type: 'Text', text: 'conflict' }))?.text).toBe('conflict')
    await ui.unmount()
  }
})
