export type ItemState = 'open' | 'draft' | 'merged' | 'closed'
export type Checks = 'pass' | 'fail' | 'pending' | 'none'
export type Mergeable = 'clean' | 'conflict' | 'blocked' | 'unknown'
export type Review = 'approved' | 'changes' | 'required' | 'none'
export type Role = 'created' | 'focus' | 'mentioned'

// One issue or pull request the session touched.
export type Item = {
  // `owner/repo#123`: what the session's URLs and a body's references meet on.
  key: string
  kind: 'issue' | 'pr'
  repo: string
  number: number
  title: string
  url: string
  state: ItemState
  // How the session came to it: opened here, part of the work's context (in
  // the person's own prompt or the body of a pull request opened here), or
  // only seen somewhere in the transcript.
  role: Role
  // A pull request's own fields.
  checks?: Checks
  mergeable?: Mergeable
  review?: Review
  // The keys a pull request's body refers to, in order, listed or not.
  refs?: string[]
}

export type Layout = 'grouped' | 'flat'

// Where the last look at GitHub stands.
export type Sync = {
  // When it last finished, in epoch milliseconds; 0 before the first.
  at: number
  isBusy: boolean
  // Why the last one failed, as gh said it.
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    trail: {
      items: Shaped<Item[]>
      sync: Shaped<Sync>
      layout: Shaped<Layout>
      showMentioned: Shaped<boolean>
    }
  }
}
