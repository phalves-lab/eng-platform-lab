import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  findEvents,
  findSystem,
  findTool,
  loadHandbook,
  moduleOf,
  readEvents,
  systemEvents,
} from '../src/index.js'
import { parseSections } from '../src/markdown.js'

const LAB = fileURLToPath(new URL('../../../handbook', import.meta.url))

const table = (rows: string[]) =>
  parseSections(
    'x.md',
    [
      '# Eventos',
      '## Tabela',
      '| Evento | Tópico | Produtor | Consumidores |',
      '| --- | --- | --- | --- |',
      ...rows,
    ].join('\n'),
  )

describe('contratos de evento', async () => {
  const handbook = await loadHandbook(LAB)

  it('lê os contratos do handbook do laboratório com produtor e consumidores', () => {
    expect(handbook.events).toHaveLength(5)
    expect(handbook.events[1]).toEqual({
      topic: 'campanhas.solicitacoes',
      event: 'solicitacao.aprovada',
      producer: 'API de solicitações de campanha',
      consumers: ['Worker de notificações', 'Worker do portal'],
      payload: 'id da solicitação, aprovadores e data da aprovação',
      source: '04-eventos.md › Tópicos e eventos',
    })
  })

  it('acha pelo tópico, pelo evento, por tópico/evento e por trecho', () => {
    expect(findEvents(handbook.events, 'campanhas.solicitacoes')).toHaveLength(3)
    expect(findEvents(handbook.events, 'Envio.Falhou').map((e) => e.topic)).toEqual([
      'notificacoes.envios',
    ])
    expect(
      findEvents(handbook.events, 'campanhas.solicitacoes/solicitacao.criada').map((e) => e.event),
    ).toEqual(['solicitacao.criada'])
    expect(findEvents(handbook.events, 'coleta').map((e) => e.event)).toEqual(['coleta.concluida'])
    expect(findEvents(handbook.events, 'inexistente')).toEqual([])
    expect(findEvents(handbook.events, ' ')).toEqual([])
  })

  it('separa o que cada sistema produz e consome e acha o módulo citado nas fontes', () => {
    const api = findSystem(handbook, 'API de solicitações de campanha')
    const portal = findSystem(handbook, 'Portal de engenharia')
    if (!api || !portal) throw new Error('fichas ausentes')
    const events = systemEvents(handbook.events, api)
    expect(events.produces.map((e) => e.event)).toEqual([
      'solicitacao.criada',
      'solicitacao.aprovada',
      'solicitacao.rejeitada',
    ])
    expect(events.consumes.map((e) => e.event)).toEqual(['envio.falhou'])
    expect(moduleOf(api)).toBe('campaign-requests')
    expect(moduleOf(portal)).toBe('portal')
    expect(moduleOf({ name: 'x', fields: { Fontes: 'catalog/dora/repos.yaml' } })).toBeNull()
    expect(moduleOf({ name: 'x', fields: {} })).toBeNull()
  })

  it('ignora tabela sem as colunas do contrato e linha incompleta', () => {
    expect(
      readEvents(
        parseSections('x.md', '## T\n| ID | Tema |\n| --- | --- |\n| ENG-PR-03 | Aprovações |'),
      ),
    ).toEqual([])
    expect(readEvents(parseSections('x.md', '## T\nsem tabela'))).toEqual([])
    expect(
      readEvents(table(['| e.um | t.um | Sistema A | B, , C |', '| e.dois | t.um |  | D |'])),
    ).toEqual([
      {
        topic: 't.um',
        event: 'e.um',
        producer: 'Sistema A',
        consumers: ['B', 'C'],
        payload: '',
        source: 'x.md › Tabela',
      },
    ])
  })
})

describe('ferramenta quem_consome', async () => {
  const handbook = await loadHandbook(LAB)
  const run = (args: unknown) => {
    const tool = findTool('quem_consome')
    if (!tool) throw new Error('quem_consome ausente')
    return tool.execute(handbook, args)
  }

  it('devolve produtor, consumidores, carga e fonte, citando os sistemas', () => {
    const answer = run({ topico: 'solicitacao.aprovada' })
    expect(answer.text).toBe(
      [
        'campanhas.solicitacoes · solicitacao.aprovada',
        '  Produz: API de solicitações de campanha',
        '  Consomem: Worker de notificações, Worker do portal',
        '  Carrega: id da solicitação, aprovadores e data da aprovação',
        '',
        'Fonte: 04-eventos.md › Tópicos e eventos',
      ].join('\n'),
    )
    expect(answer.citations.map((c) => `${c.kind}:${c.label}`)).toEqual([
      'system:API de solicitações de campanha',
      'system:Worker de notificações',
      'system:Worker do portal',
      'passage:Tópicos e eventos',
    ])
  })

  it('lista os tópicos conhecidos quando não acha e recusa argumento inválido', () => {
    expect(run({ topico: 'pagamentos' }).text).toBe(
      'Tópico ou evento "pagamentos" não encontrado. Tópicos conhecidos: campanhas.solicitacoes, notificacoes.envios, portal.coletas.',
    )
    expect(() => run({})).toThrow()
  })

  it('avisa quando o handbook não tem contratos e cita consumidor sem ficha como texto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hb-events-'))
    await writeFile(join(dir, 'a.md'), '# A\n')
    const empty = await loadHandbook(dir)
    expect(findTool('quem_consome')?.execute(empty, { topico: 'x.y' }).text).toBe(
      'O handbook não tem contratos de evento.',
    )
    await writeFile(
      join(dir, 'b.md'),
      [
        '# B',
        '## Eventos',
        '| Tópico | Evento | Produtor | Consumidores |',
        '| --- | --- | --- | --- |',
        '| t.um | e.um | Sistema solto |  |',
      ].join('\n'),
    )
    const loose = await loadHandbook(dir)
    const answer = findTool('quem_consome')?.execute(loose, { topico: 't.um' })
    expect(answer?.text).toContain('Consomem: ninguém cadastrado')
    expect(answer?.citations.map((c) => c.kind)).toEqual(['passage'])
  })
})
