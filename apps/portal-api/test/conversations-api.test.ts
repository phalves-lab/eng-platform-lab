import 'reflect-metadata'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { type ChatStreamEvent, ChatStreamEventSchema, createSseParser } from '@lab/contracts'
import type { NewChatTurn, StoredConversation } from '@lab/database'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { AskService } from '../src/ask/ask.service.js'
import { ChatService } from '../src/ask/chat.service.js'
import { MODEL_PROVIDER } from '../src/ask/model/model-provider.js'
import { loadConfig } from '../src/config/config.js'
import {
  CONVERSATION_BACKEND,
  type ConversationBackend,
  type ConversationStore,
} from '../src/conversations/conversation-backend.js'
import { HandbookService } from '../src/handbook/handbook.service.js'
import { FakeProvider } from './fake-provider.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
const ID = '0f8b2c64-8f3e-4b8e-9d5a-2f1e6c7b9a10'

const ENV = {
  NODE_ENV: 'test',
  PORTAL_HANDBOOK_DIR: HANDBOOK,
  PORTAL_PANEL_DATA: '/nope/data.json',
  PORTAL_LLM_BASE_URL: 'https://llm.example.invalid/v1',
  PORTAL_LLM_API_KEY: 'test-key',
  PORTAL_LLM_MODEL: 'modelo-sintetico',
}

const summary: StoredConversation = {
  id: ID,
  title: 'Qual o padrão de branch?',
  createdAt: '2026-11-21T12:00:00.000Z',
  updatedAt: '2026-11-21T12:00:00.000Z',
  messageCount: 2,
}

const storedConversation = {
  ...summary,
  messages: [
    { id: 1, author: 'user' as const, content: 'Pergunta antiga', createdAt: summary.createdAt },
    {
      id: 2,
      author: 'assistant' as const,
      content: 'Resposta antiga',
      mode: 'retrieval' as const,
      tools: [],
      sources: [{ source: '01-padroes.md', snippet: 'trecho', score: 3 }],
      createdAt: summary.createdAt,
    },
    { id: 3, author: 'user' as const, content: 'Pergunta sem resposta', createdAt: '' },
  ],
}

class MemoryStore implements ConversationStore {
  readonly turns: NewChatTurn[] = []
  failWith: unknown = null

  private fail() {
    if (this.failWith) throw this.failWith
  }

  async appendTurn(turn: NewChatTurn) {
    this.fail()
    this.turns.push(turn)
    return summary
  }

  async list() {
    this.fail()
    return [summary]
  }

  async find(_owner: string, id: string) {
    this.fail()
    return id === ID ? storedConversation : null
  }

  async remove(_owner: string, id: string) {
    this.fail()
    return id === ID
  }
}

const start = async (backend: ConversationBackend | null, provider = new FakeProvider()) => {
  const module = await Test.createTestingModule({ imports: [AppModule.register(loadConfig(ENV))] })
    .overrideProvider(MODEL_PROVIDER)
    .useValue(provider)
    .overrideProvider(CONVERSATION_BACKEND)
    .useValue(backend)
    .compile()
  const app = module.createNestApplication()
  await app.init()
  return app
}

const stream = async (app: INestApplication, body: object): Promise<ChatStreamEvent[]> => {
  const res = await request(app.getHttpServer())
    .post('/api/ask/stream')
    .send(body)
    .buffer(true)
    .expect(200)
  return createSseParser()(res.text).map((data) => ChatStreamEventSchema.parse(JSON.parse(data)))
}

describe('histórico de conversas na API', () => {
  let app: INestApplication | null = null

  afterEach(async () => {
    await app?.close()
    app = null
  })

  it('responde 503 nas rotas do histórico sem banco e segue respondendo o chat', async () => {
    const fake = new FakeProvider()
    fake.play({ text: ['Use o ENG-GIT-02.'] })
    app = await start(null, fake)
    const server = app.getHttpServer()
    await request(server).get('/api/conversations').expect(503)
    await request(server).get(`/api/conversations/${ID}`).expect(503)
    await request(server).delete(`/api/conversations/${ID}`).expect(503)

    const events = await stream(app, { question: 'Qual o padrão?', conversationId: ID })
    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'done'])
    expect(fake.requests[0]?.messages).toHaveLength(2)
  })

  it('grava a resposta mascarada e avisa a conversa salva depois do done', async () => {
    const store = new MemoryStore()
    const fake = new FakeProvider()
    fake.play(
      { toolCalls: [{ id: 'c1', name: 'padrao', arguments: '{"id":"ENG-GIT-02"}' }] },
      { toolCalls: [{ id: 'c2', name: 'padrao', arguments: '{"id":"ENG-GIT-03"}' }] },
      { text: ['O ENG-GIT-02 vale; responda para bia@exemplo.org.'] },
    )
    app = await start({ store, close: async () => undefined }, fake)
    const question = `Sou bia@exemplo.org, RA202612345. ${'Qual o padrão de nome de branch? '.repeat(4)}`
    const events = await stream(app, { question })

    expect(events.map((event) => event.type)).toEqual([
      'start',
      'tool',
      'tool',
      'delta',
      'done',
      'conversation',
    ])
    expect(events.at(-1)).toEqual({ type: 'conversation', conversation: summary })
    const [turn] = store.turns
    expect(turn).toMatchObject({
      owner: 'dev.local',
      conversationId: null,
      question: expect.stringMatching(/^Sou \[e-mail\], \[RA\]\. Qual/),
      answer: {
        content: 'O ENG-GIT-02 vale; responda para [e-mail].',
        mode: 'llm',
        tools: ['padrao'],
        sources: [expect.objectContaining({ ref: 'ENG-GIT-02' })],
      },
    })
    expect(turn?.title).toHaveLength(80)
    expect(turn?.title.endsWith('…')).toBe(true)
    expect(JSON.stringify(store.turns)).not.toMatch(/bia@|202612345/)
  })

  it('continua a conversa mandando os turnos anteriores ao modelo', async () => {
    const store = new MemoryStore()
    const fake = new FakeProvider()
    fake.play({ text: ['Continuação.'] })
    app = await start({ store, close: async () => undefined }, fake)
    await stream(app, { question: 'E o de commit?', conversationId: ID })

    expect(fake.requests[0]?.messages.slice(1)).toEqual([
      { role: 'user', content: 'Pergunta antiga' },
      { role: 'assistant', content: 'Resposta antiga', toolCalls: [] },
      { role: 'user', content: 'E o de commit?' },
    ])
    expect(store.turns[0]).toMatchObject({ conversationId: ID })

    await request(app.getHttpServer())
      .post('/api/ask/stream')
      .send({ question: 'Continua?', conversationId: '6b1f0a3e-2c4d-4e5f-8a9b-0c1d2e3f4a5b' })
      .expect(404)
  })

  it('lista, abre e apaga só pelo ID válido e devolve a resposta no formato do chat', async () => {
    app = await start({ store: new MemoryStore(), close: async () => undefined })
    const server = app.getHttpServer()
    expect((await request(server).get('/api/conversations').expect(200)).body).toEqual([summary])
    const opened = await request(server).get(`/api/conversations/${ID}`).expect(200)
    expect(opened.body.messages[1]).toEqual({
      author: 'assistant',
      tools: [],
      response: {
        mode: 'retrieval',
        answer: 'Resposta antiga',
        sources: [{ source: '01-padroes.md', snippet: 'trecho', score: 3 }],
      },
      createdAt: summary.createdAt,
    })
    await request(server).get('/api/conversations/nao-e-uuid').expect(400)
    await request(server).get('/api/conversations/6b1f0a3e-2c4d-4e5f-8a9b-0c1d2e3f4a5b').expect(404)
    await request(server).delete(`/api/conversations/${ID}`).expect(204)
    await request(server)
      .delete('/api/conversations/6b1f0a3e-2c4d-4e5f-8a9b-0c1d2e3f4a5b')
      .expect(404)
  })

  it('não quebra a resposta quando o banco falha ao gravar e trata tabela ausente como 503', async () => {
    const store = new MemoryStore()
    const fake = new FakeProvider()
    fake.play({ text: ['Resposta.'] })
    app = await start({ store, close: async () => undefined }, fake)
    store.failWith = new Error('connection refused')
    const events = await stream(app, { question: 'Qual o padrão?' })
    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'done'])

    store.failWith = Object.assign(new Error('relation does not exist'), { code: '42P01' })
    await request(app.getHttpServer()).get('/api/conversations').expect(503)
    store.failWith = new Error('boom')
    await request(app.getHttpServer()).get('/api/conversations').expect(500)
  })
})

describe('contexto da conversa no chat', () => {
  it('manda só os últimos seis turnos, mascarados, antes da pergunta nova', async () => {
    const handbook = new HandbookService({ handbookDir: HANDBOOK })
    await handbook.onModuleInit()
    const fake = new FakeProvider()
    fake.play({ text: ['ok'] })
    const chat = new ChatService(handbook, new AskService(handbook), fake, { llm: null }, 'regras')
    const history = Array.from({ length: 8 }, (_, index) => ({
      question: `pergunta ${index} de ana@exemplo.com`,
      answer: `resposta ${index}`,
    }))
    await chat.answer('nova', () => undefined, new AbortController().signal, history)

    const messages = fake.requests[0]?.messages ?? []
    expect(messages).toHaveLength(14)
    expect(messages[1]).toEqual({ role: 'user', content: 'pergunta 2 de [e-mail]' })
    expect(messages.at(-2)).toEqual({ role: 'assistant', content: 'resposta 7', toolCalls: [] })
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'nova' })
  })
})
