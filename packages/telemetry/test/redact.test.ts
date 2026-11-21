import { describe, expect, it } from 'vitest'
import { redactAttributes, scrubText, scrubValue } from '../src/redact.js'

describe('scrubText', () => {
  it('masks e-mails and long digit runs such as CPF, phone, card and student id', () => {
    expect(scrubText('falha para ana.souza@exemplo.com.br')).toBe('falha para [e-mail]')
    expect(scrubText('cpf 123.456.789-09 tel (11) 91234-5678')).toBe(
      'cpf [número] tel (11) [número]',
    )
    expect(scrubText('cartão 4111 1111 1111 1111 e RA 202612345')).toBe(
      'cartão [número] e RA [número]',
    )
  })

  it('keeps dates, durations, ids and hashes readable', () => {
    const text = 'run 2026-11-20T12:00:00Z took 1234 ms id 0f8c3a2e-5b6d-4e1f-9a7b-123456789012'
    expect(scrubText(text)).toBe(text)
    expect(scrubText('sha 3d3c42e5aac5ba805825da76410c181273ba90b1')).toBe(
      'sha 3d3c42e5aac5ba805825da76410c181273ba90b1',
    )
  })
})

describe('scrubValue', () => {
  it('drops sensitive keys and scrubs nested strings and errors', () => {
    expect(
      scrubValue({
        token: 'abc',
        Authorization: 'Bearer x',
        userEmail: 'ana@exemplo.com',
        nested: { note: 'contato bruno@exemplo.com', list: ['12345678901', 3] },
        error: new Error('sem acesso para ana@exemplo.com'),
        count: 2,
        empty: null,
      }),
    ).toEqual({
      token: '[removido]',
      Authorization: '[removido]',
      userEmail: '[removido]',
      nested: { note: 'contato [e-mail]', list: ['[número]', 3] },
      error: { name: 'Error', message: 'sem acesso para [e-mail]' },
      count: 2,
      empty: null,
    })
  })

  it('stops descending after a few levels', () => {
    const deep = { a: { b: { c: { d: { e: 'ana@exemplo.com' } } } } }
    expect(scrubValue(deep)).toEqual({ a: { b: { c: { d: { e: 'ana@exemplo.com' } } } } })
  })
})

describe('redactAttributes', () => {
  it('removes query strings, client addresses and user agents', () => {
    expect(
      redactAttributes({
        'http.method': 'GET',
        'url.full': 'https://api.example.invalid/search?q=ana@exemplo.com',
        'http.target': '/api/handbook/search?term=x',
        'url.query': 'q=ana',
        'user_agent.original': 'Mozilla',
        'client.address': '10.0.0.1',
        'http.status_code': 200,
      }),
    ).toEqual({
      'http.method': 'GET',
      'url.full': 'https://api.example.invalid/search',
      'http.target': '/api/handbook/search',
      'http.status_code': 200,
    })
  })
})
