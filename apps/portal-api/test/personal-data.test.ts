import { describe, expect, it } from 'vitest'
import { maskPersonalData } from '../src/ask/model/personal-data.js'

describe('filtro de dado pessoal reforçado', () => {
  it('mascara números de cartão com dígito verificador válido, agrupados ou não', () => {
    expect(maskPersonalData('cartão 4111 1111 1111 1111 vence logo')).toBe(
      'cartão [cartão] vence logo',
    )
    expect(maskPersonalData('5500-0000-0000-0004')).toBe('[cartão]')
    expect(maskPersonalData('amex 3782 822463 10005')).toBe('amex [cartão]')
    expect(maskPersonalData('final 4111111111111111.')).toBe('final [cartão].')
  })

  it('preserva números longos que não passam no dígito verificador', () => {
    const safe = 'pedido 1234567890123456 e timestamp 1732190400000'
    expect(maskPersonalData(safe)).toBe(safe)
  })

  it('mascara o RA de aluno no formato do laboratório, com ou sem separador', () => {
    expect(maskPersonalData('RA202612345, ra: 202612345 e RA 202612345')).toBe('[RA], [RA] e [RA]')
    expect(maskPersonalData('para 202612345 alunos')).toBe('para 202612345 alunos')
    expect(maskPersonalData('RA 20261234')).toBe('RA 20261234')
  })

  it('não confunde telefone com cartão e mascara tudo numa mesma frase', () => {
    expect(maskPersonalData('+55 11 91234 5678')).toBe('[telefone]')
    expect(
      maskPersonalData(
        'Sou bia@exemplo.org, RA202600001, CPF 123.456.789-09, cartão 4111-1111-1111-1111, fone 91234-5678',
      ),
    ).toBe('Sou [e-mail], [RA], CPF [CPF], cartão [cartão], fone [telefone]')
  })

  it('é idempotente sobre texto já mascarado', () => {
    const masked = maskPersonalData('ana@exemplo.com 4111 1111 1111 1111 RA202612345')
    expect(maskPersonalData(masked)).toBe(masked)
  })
})
