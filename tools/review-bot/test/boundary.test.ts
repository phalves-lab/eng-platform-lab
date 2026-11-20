import { describe, expect, it } from 'vitest'
import { DataBoundaryError, assertDataBoundary } from '../src/boundary.js'

describe('assertDataBoundary', () => {
  it('bloqueia dado confidencial indo para o LLM do laboratório', () => {
    expect(() =>
      assertDataBoundary({ confidential: true, dryRun: false, provider: 'lab' }),
    ).toThrow(DataBoundaryError)
  })

  it('permite montar o prompt com dado confidencial em dry-run', () => {
    expect(() =>
      assertDataBoundary({ confidential: true, dryRun: true, provider: 'lab' }),
    ).not.toThrow()
  })

  it('permite dado sintético com chamada real', () => {
    expect(() =>
      assertDataBoundary({ confidential: false, dryRun: false, provider: 'lab' }),
    ).not.toThrow()
  })
})
