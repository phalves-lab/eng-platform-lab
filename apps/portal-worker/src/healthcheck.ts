import { isHeartbeatFresh } from './heartbeat.js'

const file = process.env.WORKER_HEARTBEAT_FILE
process.exitCode = file && (await isHeartbeatFresh(file)) ? 0 : 1
