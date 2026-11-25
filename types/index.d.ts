export type ItemState = 'open' | 'draft' | 'merged' | 'closed'
export type Checks = 'pass' | 'fail' | 'pending' | 'none'
export type Mergeable = 'clean' | 'conflict' | 'blocked' | 'unknown'
export type Role = 'created' | 'focus' | 'mentioned'
export type Review = 'approved' | 'changes' | 'required' | 'none'

// One issue or pull request the session touched.
export type Item = {
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
  // The URLs of the listed items a pull request's body refers to, in order.
  refs?: string[]
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
