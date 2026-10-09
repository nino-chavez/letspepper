// Load with: node --import ./scripts/test-support/alias-register.mjs --test …
import { register } from 'node:module'

register('./alias-hooks.mjs', import.meta.url)
