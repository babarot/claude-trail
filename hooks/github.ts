import type { EngineInterface } from 'claude-code'

import type { Checks, Item, Mergeable, Review } from '../types'
import { refsIn } from './collect'

export type Fetched = Omit<Item, 'role'>

// Keys go to GitHub in batches of this many aliases per query.
const BATCH = 40

const FIELDS = `
  __typename
  ... on Issue { title url state }
  ... on PullRequest {
    title url state isDraft mergeable mergeStateStatus reviewDecision body
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  }`

type Node = {
  __typename: 'Issue' | 'PullRequest'
  title: string
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft?: boolean
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  mergeStateStatus?: string
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  body?: string
  commits?: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] }
}

const parse = (key: string) => {
  const m = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(key)
  return m ? { owner: m[1]!, name: m[2]!, number: Number(m[3]) } : undefined
}

export function query(keys: string[]): string {
  const parts = keys.flatMap((key, i) => {
    const ref = parse(key)
    if (!ref) return []
    return [
      `i${i}: repository(owner: "${ref.owner}", name: "${ref.name}") { issueOrPullRequest(number: ${ref.number}) { ${FIELDS} } }`,
    ]
  })
  return `query { ${parts.join('\n')} }`
}

const checksOf = (node: Node): Checks => {
  const state = node.commits?.nodes[0]?.commit.statusCheckRollup?.state
  if (state === undefined) return 'none'
  if (state === 'SUCCESS') return 'pass'
  if (state === 'FAILURE' || state === 'ERROR') return 'fail'
  return 'pending'
}

const mergeableOf = (node: Node): Mergeable => {
  if (node.mergeable === 'CONFLICTING' || node.mergeStateStatus === 'DIRTY') return 'conflict'
  if (node.mergeStateStatus === 'BLOCKED' || node.mergeStateStatus === 'BEHIND') return 'blocked'
  if (node.mergeable === 'MERGEABLE') return 'clean'
  return 'unknown'
}

const reviewOf = (node: Node): Review =>
  node.reviewDecision === 'APPROVED'
    ? 'approved'
    : node.reviewDecision === 'CHANGES_REQUESTED'
      ? 'changes'
      : node.reviewDecision === 'REVIEW_REQUIRED'
        ? 'required'
        : 'none'

export function toItem(key: string, node: Node): Fetched {
  const ref = parse(key)!
  const repo = `${ref.owner}/${ref.name}`
  const base = { key, repo, number: ref.number, title: node.title, url: node.url }
  if (node.__typename === 'Issue') {
    return { ...base, kind: 'issue', state: node.state === 'OPEN' ? 'open' : 'closed' }
  }
  return {
    ...base,
    kind: 'pr',
    state:
      node.state === 'MERGED' ? 'merged' : node.state === 'CLOSED' ? 'closed' : node.isDraft ? 'draft' : 'open',
    checks: checksOf(node),
    mergeable: mergeableOf(node),
    review: reviewOf(node),
    refs: refsIn(node.body ?? '', repo).filter(one => one !== key),
  }
}

// Looks the keys up on GitHub through gh. A key GitHub has no answer for (a
// repository gh cannot read, a number that is gone) is left out.
export async function fetchItems(
  $: EngineInterface,
  keys: string[],
): Promise<{ items: Map<string, Fetched>; error?: string }> {
  const items = new Map<string, Fetched>()
  let error: string | undefined
  for (let start = 0; start < keys.length; start += BATCH) {
    const batch = keys.slice(start, start + BATCH)
    const ran = await $.process
      .run(['gh', 'api', 'graphql', '-f', `query=${query(batch)}`], { timeoutMs: 60_000 })
      .catch((cause: unknown) => ({ exitCode: -1, stdout: '', stderr: String(cause) }))
    // gh exits non-zero when any alias failed, and still prints the rest.
    let data: Record<string, { issueOrPullRequest: Node | null } | null> | undefined
    try {
      data = (JSON.parse(ran.stdout) as { data?: typeof data }).data
    } catch {
      data = undefined
    }
    if (!data) {
      error = ran.stderr.trim().split('\n')[0] || `gh exited ${ran.exitCode}`
      continue
    }
    batch.forEach((key, i) => {
      const node = data?.[`i${i}`]?.issueOrPullRequest
      if (node) items.set(key, toItem(key, node))
    })
  }
  return { items, error }
}
