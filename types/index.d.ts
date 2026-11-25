export type ItemState = 'open' | 'draft' | 'merged' | 'closed'
export type Checks = 'pass' | 'fail' | 'pending' | 'none'
export type Mergeable = 'clean' | 'conflict' | 'blocked' | 'unknown'
export type Review = 'approved' | 'changes' | 'required' | 'none'

// One issue or pull request the session touched.
export type Item = {
  kind: 'issue' | 'pr'
  repo: string
  number: number
  title: string
  url: string
  state: ItemState
  // Opened in this session, rather than only mentioned.
  isCreated: boolean
  // A pull request's own fields.
  checks?: Checks
  mergeable?: Mergeable
  review?: Review
  // The issue numbers a pull request closes, in its own repository.
  closes?: number[]
}

export type Layout = 'grouped' | 'flat'

declare module 'claude-code' {
  interface PluginState {
    trail: {
      layout: Shaped<Layout>
      showMentioned: Shaped<boolean>
    }
  }
}
