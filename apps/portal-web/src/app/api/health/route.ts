export const dynamic = 'force-dynamic'

/** Liveness of the web server itself; it does not call portal-api. */
export const GET = () => Response.json({ status: 'ok' })
