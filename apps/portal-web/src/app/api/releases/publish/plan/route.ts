import { ReleasePublishRequestSchema } from '@lab/contracts'
import { relay } from '@/lib/release-relay'
import { releasesApi } from '@/lib/releases-api'

export function POST(request: Request) {
  return relay(request, ReleasePublishRequestSchema, releasesApi.publishPlan)
}
