import { io } from 'socket.io-client'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

const TEST_FILE = '/home/z/my-project/workspace/test-delete-me.txt'
let events = 0

const socket = io('http://127.0.0.1:3000', { path: '/socket.io/', transports: ['polling','websocket'] })

socket.on('connect', () => console.log('Connected'))
socket.on('files:changed', (d) => { events++; console.log('files:changed #' + events + ':', d.path, '(' + d.eventType + ')') })

setTimeout(async () => {
  console.log('Creating file...')
  writeFileSync(TEST_FILE, 'hello')
  await new Promise(r => setTimeout(r, 800))
  console.log('Deleting file...')
  unlinkSync(TEST_FILE)
  await new Promise(r => setTimeout(r, 800))
  console.log('\nTotal events:', events, events >= 2 ? 'PASS (create + delete events received)' : 'PARTIAL')
  socket.disconnect()
  process.exit(0)
}, 1500)
