import 'reflect-metadata'
import { runChatEvals } from './cli.js'

process.exitCode = await runChatEvals(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => process.stdout.write(text),
})
