import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  CHANNELS,
  approve,
  cancel,
  createDraft,
  reject,
  schedule,
  submit,
  type CampaignRequest,
  type DomainError,
  type Result,
} from '../domain/campaign-request.js'
import type { CampaignRequestRepository } from '../domain/repository.js'

export interface AppDependencies {
  repository: CampaignRequestRepository
  clock: () => Date
  newId: () => string
}

const draftBody = z.object({
  title: z.string(),
  businessUnit: z.string().min(1),
  channel: z.enum(CHANNELS),
  budgetCents: z.number().int(),
  startDate: z.string(),
  endDate: z.string(),
})

const userHeader = z.object({ 'x-user-id': z.string().min(1) })

const idParams = z.object({ id: z.string().uuid() })

const STATUS_BY_ERROR: Record<DomainError['code'], number> = {
  INVALID_TITLE: 422,
  INVALID_PERIOD: 422,
  LEAD_TIME: 422,
  INVALID_BUDGET: 422,
  INVALID_TRANSITION: 409,
  SELF_APPROVAL: 403,
  DUPLICATE_APPROVAL: 409,
}

const sendDomainError = (reply: FastifyReply, error: DomainError) =>
  reply.status(STATUS_BY_ERROR[error.code]).send({ error })

export const buildApp = (deps: AppDependencies): FastifyInstance => {
  const app = Fastify({ logger: false })

  app.get('/health', async () => ({ status: 'ok' }))

  app.post('/campaign-requests', async (request, reply) => {
    const headers = userHeader.safeParse(request.headers)
    if (!headers.success) return reply.status(401).send({ error: { code: 'UNAUTHENTICATED' } })
    const body = draftBody.safeParse(request.body)
    if (!body.success)
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', issues: body.error.issues } })

    const now = deps.clock()
    const result = createDraft(
      { ...body.data, requesterId: headers.data['x-user-id'] },
      { id: deps.newId(), today: now.toISOString().slice(0, 10), now: now.toISOString() },
    )
    if (!result.ok) return sendDomainError(reply, result.error)

    await deps.repository.insert(result.value)
    return reply.status(201).send(result.value)
  })

  app.get('/campaign-requests/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: { code: 'BAD_REQUEST' } })
    const found = await deps.repository.findById(params.data.id)
    if (!found) return reply.status(404).send({ error: { code: 'NOT_FOUND' } })
    return found
  })

  const registerTransition = (
    action: string,
    apply: (current: CampaignRequest, userId: string) => Result<CampaignRequest>,
  ) => {
    app.post(`/campaign-requests/:id/${action}`, async (request, reply) => {
      const headers = userHeader.safeParse(request.headers)
      if (!headers.success) return reply.status(401).send({ error: { code: 'UNAUTHENTICATED' } })
      const params = idParams.safeParse(request.params)
      if (!params.success) return reply.status(400).send({ error: { code: 'BAD_REQUEST' } })

      const current = await deps.repository.findById(params.data.id)
      if (!current) return reply.status(404).send({ error: { code: 'NOT_FOUND' } })

      const result = apply(current, headers.data['x-user-id'])
      if (!result.ok) return sendDomainError(reply, result.error)

      await deps.repository.update(result.value)
      return result.value
    })
  }

  registerTransition('submit', (current) => submit(current))
  registerTransition('approve', (current, userId) => approve(current, userId))
  registerTransition('reject', (current) => reject(current))
  registerTransition('schedule', (current) => schedule(current))
  registerTransition('cancel', (current) => cancel(current))

  return app
}
