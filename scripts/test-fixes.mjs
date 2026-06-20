// Test client that connects to the local server and verifies the fixes
// Verifies: file watcher events fire when files appear in workspace from terminal commands
import { io } from 'socket.io-client'
import { writeFileSync, rmSync } from 'fs'
import { join } from 'path'

const SERVER = 'http://127.0.0.1:3000'
const TEST_WORKSPACE = '/home/z/my-project/workspace'
const TEST_FILE = join(TEST_WORKSPACE, 'test-downloaded-file.txt')

console.log('Connecting to', SERVER)
const socket = io(SERVER, {
  path: '/socket.io/',
  transports: ['polling', 'websocket'],
  reconnection: false,
})

let filesChangedEvents = 0
let lastFilesChanged = null
let workspaceInfo = null
let fileListing = null

socket.on('connect', () => {
  console.log('[OK] Connected. Socket ID:', socket.id)
})

socket.on('workspace:info', (data) => {
  workspaceInfo = data
  console.log('[OK] workspace:info received:', data)
})

socket.on('files:changed', (data) => {
  filesChangedEvents++
  lastFilesChanged = data
  console.log('[OK] files:changed event #' + filesChangedEvents + ':', data)
})

socket.on('terminal:connected', (data) => {
  console.log('[OK] terminal:connected received. workspace:', data.workspace, 'sudoMode:', data.sudoMode)
})

socket.on('file:listing', (data) => {
  fileListing = data
  console.log('[OK] file:listing received. files count:', data.files?.length, 'error:', data.error)
})

socket.on('disconnect', () => {
  console.log('[INFO] Disconnected')
})

setTimeout(async () => {
  // Step 1: List files in workspace
  console.log('\n=== Step 1: List files in workspace ===')
  socket.emit('file:list', { path: '', showHidden: false })

  await new Promise(r => setTimeout(r, 1000))

  // Step 2: Simulate a "downloaded" file appearing in workspace
  console.log('\n=== Step 2: Simulate downloaded file (write directly to filesystem, like wget would) ===')
  console.log('Writing test file to:', TEST_FILE)
  writeFileSync(TEST_FILE, 'This simulates a downloaded file from wget/curl\n', 'utf-8')

  // Wait for file watcher to fire (debounced 300ms)
  await new Promise(r => setTimeout(r, 1500))

  console.log('\n=== Step 3: Verify files:changed event fired ===')
  if (filesChangedEvents > 0) {
    console.log('[PASS] File watcher detected the new file! Events:', filesChangedEvents)
  } else {
    console.log('[FAIL] No files:changed events received')
  }

  // Step 4: List files again to confirm the file appears
  console.log('\n=== Step 4: List files again ===')
  socket.emit('file:list', { path: '', showHidden: false })
  await new Promise(r => setTimeout(r, 1000))

  if (fileListing && fileListing.files) {
    const hasTestFile = fileListing.files.some(f => f.name === 'test-downloaded-file.txt')
    if (hasTestFile) {
      console.log('[PASS] test-downloaded-file.txt appears in file listing!')
    } else {
      console.log('[FAIL] test-downloaded-file.txt NOT in listing')
      console.log('  Files:', fileListing.files.map(f => f.name))
    }
  }

  // Step 5: Cleanup
  console.log('\n=== Step 5: Cleanup ===')
  try {
    rmSync(TEST_FILE)
    console.log('[OK] Test file removed')
  } catch (e) {
    console.log('[WARN] Could not remove test file:', e.message)
  }

  console.log('\n=== Summary ===')
  console.log('  Files changed events received:', filesChangedEvents)
  console.log('  Workspace info received:', workspaceInfo ? 'YES' : 'NO')
  console.log('  File listing received:', fileListing ? 'YES' : 'NO')
  console.log('  Test result:', filesChangedEvents > 0 ? 'PASS' : 'FAIL')

  socket.disconnect()
  process.exit(filesChangedEvents > 0 ? 0 : 1)
}, 2000)
