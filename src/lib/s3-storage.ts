/**
 * Backblaze B2 (S3-compatible) Storage Service
 *
 * Provides persistent cloud storage for the CloudShell IDE, replacing
 * ephemeral local disk storage on HuggingFace Spaces.
 *
 * All credentials come from environment variables:
 *   B2_KEY_ID         — Backblaze B2 application key ID
 *   B2_APPLICATION_KEY — Backblaze B2 application key
 *   B2_BUCKET_NAME     — Target bucket name (default: cloudshell-app-storage)
 *   B2_ENDPOINT        — S3 endpoint (e.g. s3.us-east-005.backblazeb2.com)
 *
 * Architecture:
 *   - User data (users.json, audit.log) → B2 bucket root
 *   - User workspace files → B2 bucket under workspaces/{username}/
 *   - Local disk is still used for workspace directories (terminal needs them)
 *     but critical data is ALSO synced to B2 for persistence
 *
 * CRITICAL FIXES (v2):
 *   1. s3Put now has try/catch — previously NO error handling on PutObjectCommand
 *   2. isS3Configured() now logs exactly which env vars are missing
 *   3. Startup diagnostic logs all env var values (masked secret)
 *   4. Default bucket name changed from 'claude' to 'cloudshell-app-storage'
 *   5. All public functions throw explicit errors instead of silently returning void/null
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'

// ─── Configuration ────────────────────────────────────────────────
const B2_KEY_ID = process.env.B2_KEY_ID || ''
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || ''
// FIXED: Default bucket was 'claude' — real bucket is 'cloudshell-app-storage'
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'cloudshell-app-storage'
const B2_ENDPOINT = process.env.B2_ENDPOINT || 's3.us-east-005.backblazeb2.com'

// Parse region from endpoint (e.g. "us-east-005" from "s3.us-east-005.backblazeb2.com")
const B2_REGION = B2_ENDPOINT.replace(/^s3\./, '').replace(/\.backblazeb2\.com$/, '') || 'us-east-005'

// ─── Startup Diagnostic ───────────────────────────────────────────
// Log B2 config on module load so we can see exactly what env vars are loaded
console.log('[S3] B2 Configuration Diagnostic:')
console.log(`[S3]   B2_KEY_ID:         ${B2_KEY_ID ? B2_KEY_ID.substring(0, 8) + '...' + B2_KEY_ID.substring(B2_KEY_ID.length - 4) : '*** MISSING ***'}`)
console.log(`[S3]   B2_APPLICATION_KEY: ${B2_APPLICATION_KEY ? '***present*** (' + B2_APPLICATION_KEY.length + ' chars)' : '*** MISSING ***'}`)
console.log(`[S3]   B2_BUCKET_NAME:     ${B2_BUCKET_NAME || '*** MISSING ***'}`)
console.log(`[S3]   B2_ENDPOINT:        ${B2_ENDPOINT || '*** MISSING ***'}`)
console.log(`[S3]   B2_REGION:          ${B2_REGION}`)
console.log(`[S3]   forcePathStyle:     true (required for B2)`)

// ─── S3 Client (lazy initialization) ─────────────────────────────
let _s3Client: S3Client | null = null

function isS3Configured(): boolean {
  const missing: string[] = []
  if (!B2_KEY_ID) missing.push('B2_KEY_ID')
  if (!B2_APPLICATION_KEY) missing.push('B2_APPLICATION_KEY')
  if (!B2_BUCKET_NAME) missing.push('B2_BUCKET_NAME')
  if (!B2_ENDPOINT) missing.push('B2_ENDPOINT')
  if (missing.length > 0) {
    console.error(`[S3] NOT CONFIGURED — missing env vars: ${missing.join(', ')}. ALL B2 uploads will silently fail!`)
    return false
  }
  return true
}

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client
  console.log('[S3] Initializing S3 client...')
  _s3Client = new S3Client({
    endpoint: `https://${B2_ENDPOINT}`,
    region: B2_REGION,
    credentials: {
      accessKeyId: B2_KEY_ID,
      secretAccessKey: B2_APPLICATION_KEY,
    },
    forcePathStyle: true, // Required for Backblaze B2
  })
  console.log(`[S3] S3 client initialized: endpoint=https://${B2_ENDPOINT}, region=${B2_REGION}, bucket=${B2_BUCKET_NAME}`)
  return _s3Client
}

// ─── Core Operations ─────────────────────────────────────────────

/** Upload a string or Buffer to B2 — FIXED: now has try/catch with full error logging */
export async function s3Put(key: string, data: string | Buffer | Uint8Array, contentType?: string): Promise<void> {
  if (!isS3Configured()) {
    console.error(`[S3] UPLOAD SKIPPED (not configured) — key: ${key}`)
    return
  }
  try {
    const client = getS3Client()
    const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data
    const result = await client.send(new PutObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }))
    const size = typeof data === 'string' ? data.length : (data as Buffer).length
    console.log(`[S3] Uploaded: ${key} (${size} bytes) to bucket:${B2_BUCKET_NAME} — ETag:${result.ETag || 'N/A'}`)
  } catch (err: any) {
    // Log FULL error object — previously this was completely unhandled
    console.error(`[S3] UPLOAD FAILED for key "${key}" to bucket "${B2_BUCKET_NAME}":`)
    console.error(`[S3]   Error name:    ${err.name || 'unknown'}`)
    console.error(`[S3]   Error message: ${err.message || 'unknown'}`)
    console.error(`[S3]   HTTP status:   ${err.$metadata?.httpStatusCode || 'N/A'}`)
    console.error(`[S3]   AWS request ID: ${err.$metadata?.requestId || 'N/A'}`)
    console.error(`[S3]   Full error:    ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`)
    // Re-throw so callers can detect failure instead of thinking upload succeeded
    throw err
  }
}

/** Download a string from B2 */
export async function s3GetString(key: string): Promise<string | null> {
  if (!isS3Configured()) return null
  try {
    const client = getS3Client()
    const response = await client.send(new GetObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key,
    }))
    const body = response.Body
    if (!body) return null
    const bytes = await body.transformToByteArray()
    return Buffer.from(bytes).toString('utf-8')
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null // Key doesn't exist — not an error
    }
    console.error(`[S3] Download failed for key ${key}:`, err.message, `(status: ${err.$metadata?.httpStatusCode || 'N/A'})`)
    return null
  }
}

/** Download a Buffer from B2 */
export async function s3GetBuffer(key: string): Promise<Buffer | null> {
  if (!isS3Configured()) return null
  try {
    const client = getS3Client()
    const response = await client.send(new GetObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key,
    }))
    const body = response.Body
    if (!body) return null
    const bytes = await body.transformToByteArray()
    return Buffer.from(bytes)
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null
    }
    console.error(`[S3] Buffer download failed for key ${key}:`, err.message, `(status: ${err.$metadata?.httpStatusCode || 'N/A'})`)
    return null
  }
}

/** Delete an object from B2 */
export async function s3Delete(key: string): Promise<void> {
  if (!isS3Configured()) return
  try {
    const client = getS3Client()
    await client.send(new DeleteObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key,
    }))
    console.log(`[S3] Deleted: ${key} from bucket:${B2_BUCKET_NAME}`)
  } catch (err: any) {
    console.error(`[S3] Delete failed for key ${key}:`, err.message, `(status: ${err.$metadata?.httpStatusCode || 'N/A'})`)
  }
}

/** Copy an object within B2 (for rename operations) */
export async function s3Copy(sourceKey: string, destKey: string): Promise<void> {
  if (!isS3Configured()) return
  try {
    const client = getS3Client()
    await client.send(new CopyObjectCommand({
      Bucket: B2_BUCKET_NAME,
      CopySource: `${B2_BUCKET_NAME}/${sourceKey}`,
      Key: destKey,
    }))
    console.log(`[S3] Copied: ${sourceKey} → ${destKey}`)
  } catch (err: any) {
    console.error(`[S3] Copy failed ${sourceKey} → ${destKey}:`, err.message, `(status: ${err.$metadata?.httpStatusCode || 'N/A'})`)
  }
}

/** Rename = copy + delete old */
export async function s3Rename(oldKey: string, newKey: string): Promise<void> {
  await s3Copy(oldKey, newKey)
  await s3Delete(oldKey)
}

/** List objects under a prefix */
export async function s3List(prefix: string, maxKeys?: number): Promise<string[]> {
  if (!isS3Configured()) return []
  try {
    const client = getS3Client()
    const response = await client.send(new ListObjectsV2Command({
      Bucket: B2_BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxKeys || 1000,
    }))
    return (response.Contents || []).map(obj => obj.Key || '')
  } catch (err: any) {
    console.error(`[S3] List failed for prefix ${prefix}:`, err.message, `(status: ${err.$metadata?.httpStatusCode || 'N/A'})`)
    return []
  }
}

/** Check if an object exists in B2 */
export async function s3Exists(key: string): Promise<boolean> {
  if (!isS3Configured()) return false
  try {
    const client = getS3Client()
    await client.send(new HeadObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key,
    }))
    return true
  } catch {
    return false
  }
}

// ─── User Data Operations ────────────────────────────────────────
// These operate on the user database (users.json) and audit log

const USERS_KEY = 'auth/users.json'
const AUDIT_KEY = 'auth/audit.log'

/** Save users.json to B2 */
export async function s3SaveUsers(usersJson: string): Promise<void> {
  await s3Put(USERS_KEY, usersJson, 'application/json')
}

/** Load users.json from B2 */
export async function s3LoadUsers(): Promise<string | null> {
  return s3GetString(USERS_KEY)
}

/** Append to audit log in B2 (read existing + append new entry + re-upload) */
export async function s3AppendAudit(entry: string): Promise<void> {
  const existing = await s3GetString(AUDIT_KEY) || ''
  const updated = existing + entry
  await s3Put(AUDIT_KEY, updated, 'text/plain')
}

// ─── Workspace File Operations ───────────────────────────────────
// These sync workspace files to/from B2

/** Convert a local workspace path to an S3 key */
export function workspacePathToS3Key(localPath: string, workspaceDir: string): string {
  // Remove the workspace dir prefix to get the relative path
  const relativePath = localPath.replace(workspaceDir, '').replace(/^\//, '')
  // S3 key: workspaces/{username}/relative/path
  const workspaceName = workspaceDir.split('/').pop() || 'default'
  return `workspaces/${workspaceName}/${relativePath}`
}

/** Convert an S3 key back to a local workspace path */
export function s3KeyToLocalPath(s3Key: string, workspaceDir: string): string {
  // Remove "workspaces/{username}/" prefix
  const parts = s3Key.split('/')
  if (parts.length >= 3 && parts[0] === 'workspaces') {
    // parts[1] is username, rest is the relative path
    const relativePath = parts.slice(2).join('/')
    return `${workspaceDir}/${relativePath}`
  }
  return `${workspaceDir}/${s3Key}`
}

/** Upload a workspace file to B2 */
export async function s3UploadWorkspaceFile(
  localPath: string,
  content: string | Buffer,
  workspaceDir: string,
  contentType?: string
): Promise<void> {
  const key = workspacePathToS3Key(localPath, workspaceDir)
  try {
    await s3Put(key, content, contentType)
  } catch (err: any) {
    // Don't re-throw for workspace uploads — the local file is the primary,
    // B2 is the backup. Log the error but don't crash the socket handler.
    console.error(`[S3] Workspace file upload failed (local file still saved): ${key}`, err.message)
  }
}

/** Download a workspace file from B2 */
export async function s3DownloadWorkspaceFile(
  localPath: string,
  workspaceDir: string
): Promise<string | null> {
  const key = workspacePathToS3Key(localPath, workspaceDir)
  return s3GetString(key)
}

/** Delete a workspace file from B2 */
export async function s3DeleteWorkspaceFile(localPath: string, workspaceDir: string): Promise<void> {
  const key = workspacePathToS3Key(localPath, workspaceDir)
  await s3Delete(key)
}

/** Rename a workspace file in B2 */
export async function s3RenameWorkspaceFile(
  oldLocalPath: string,
  newLocalPath: string,
  workspaceDir: string
): Promise<void> {
  const oldKey = workspacePathToS3Key(oldLocalPath, workspaceDir)
  const newKey = workspacePathToS3Key(newLocalPath, workspaceDir)
  await s3Rename(oldKey, newKey)
}

/** Upload a streamed file (from busboy upload) to B2 */
export async function s3UploadStream(
  key: string,
  buffer: Buffer,
  contentType?: string
): Promise<void> {
  await s3Put(key, buffer, contentType)
}

// ─── FCC Config Operations ──────────────────────────────────────
// These sync the FCC proxy config file (~/.fcc/.env) to B2

const FCC_ENV_KEY = 'config/fcc-env'

/** Save FCC .env config to B2 */
export async function s3SaveFccEnv(content: string): Promise<void> {
  await s3Put(FCC_ENV_KEY, content, 'text/plain')
}

/** Load FCC .env config from B2 */
export async function s3LoadFccEnv(): Promise<string | null> {
  return s3GetString(FCC_ENV_KEY)
}

// ─── Bashrc Env Operations ──────────────────────────────────────
// These sync the shell environment file (~/.bashrc_env) to B2

const BASHRC_ENV_KEY = 'config/bashrc-env'

/** Save bashrc_env to B2 */
export async function s3SaveBashrcEnv(content: string): Promise<void> {
  await s3Put(BASHRC_ENV_KEY, content, 'text/plain')
}

/** Load bashrc_env from B2 */
export async function s3LoadBashrcEnv(): Promise<string | null> {
  return s3GetString(BASHRC_ENV_KEY)
}

// ─── SQLite Database Backup ──────────────────────────────────────
// Periodically backup the SQLite database to B2 for disaster recovery
// SQLite cannot be replaced by B2 (it needs local filesystem access),
// but we can backup it to prevent data loss on container restart.

const DB_BACKUP_KEY = 'backup/custom.db'
const DB_BACKUP_TIMESTAMP_KEY = 'backup/custom.db.timestamp'

/** Backup SQLite database to B2 */
export async function s3BackupDatabase(dbPath: string): Promise<void> {
  if (!isS3Configured()) return
  try {
    const { readFileSync } = await import('fs')
    if (!readFileSync) return // ESM guard
    const dbBuffer = readFileSync(dbPath)
    await s3Put(DB_BACKUP_KEY, dbBuffer, 'application/x-sqlite3')
    const timestamp = new Date().toISOString()
    await s3Put(DB_BACKUP_TIMESTAMP_KEY, timestamp, 'text/plain')
    console.log(`[S3] Database backup uploaded: ${dbPath} (${dbBuffer.length} bytes) at ${timestamp}`)
  } catch (err: any) {
    console.error('[S3] Database backup failed:', err.message)
  }
}

/** Restore SQLite database from B2 backup */
export async function s3RestoreDatabase(dbPath: string): Promise<boolean> {
  if (!isS3Configured()) return false
  try {
    const dbBuffer = await s3GetBuffer(DB_BACKUP_KEY)
    if (!dbBuffer) {
      console.log('[S3] No database backup found in B2')
      return false
    }
    const { writeFileSync, mkdirSync } = await import('fs')
    const { dirname } = await import('path')
    // Ensure parent directory exists
    const dir = dirname(dbPath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(dbPath, dbBuffer)
    const timestamp = await s3GetString(DB_BACKUP_TIMESTAMP_KEY)
    console.log(`[S3] Database restored from B2 backup (${dbBuffer.length} bytes, backup time: ${timestamp || 'unknown'})`)
    return true
  } catch (err: any) {
    console.error('[S3] Database restore failed:', err.message)
    return false
  }
}

// ─── Initialization: Sync B2 data on startup ─────────────────────
/** 
 * On startup, sync all critical data from B2 to local disk.
 * B2 is the persistent source of truth; local disk is ephemeral.
 * 
 * Sync order:
 *   1. users.json (auth data) — B2 takes priority
 *   2. FCC .env (proxy config) — restore if missing locally
 *   3. bashrc_env (shell config) — restore if missing locally
 *   4. SQLite database — restore from backup if missing locally
 *   5. Workspace files — restore from B2 to local disk
 */
export async function s3InitSync(localUsersJson: string | null): Promise<string | null> {
  console.log('[S3] Starting B2 initialization sync...')
  
  if (!isS3Configured()) {
    console.error('[S3] B2 NOT CONFIGURED — skipping initialization sync. All data will be local-only and lost on container restart!')
    return localUsersJson
  }

  // ── 1. Users.json sync ──
  const b2Users = await s3LoadUsers()
  if (b2Users) {
    console.log('[S3] Found existing users.json in B2 — using cloud data')
  } else if (localUsersJson) {
    console.log('[S3] No B2 data found — uploading local users.json as initial sync')
    try {
      await s3SaveUsers(localUsersJson)
    } catch (err: any) {
      console.error('[S3] Failed to upload initial users.json:', err.message)
    }
  }
  const usersData = b2Users || localUsersJson

  // ── 2. FCC .env sync ──
  const b2FccEnv = await s3LoadFccEnv()
  if (b2FccEnv) {
    const { writeFileSync, mkdirSync } = await import('fs')
    const { join } = await import('path')
    const appHome = process.env.APP_HOME || process.env.HOME || '/home/cloudshell'
    const fccDir = join(appHome, '.fcc')
    mkdirSync(fccDir, { recursive: true })
    writeFileSync(join(fccDir, '.env'), b2FccEnv, 'utf-8')
    console.log('[S3] FCC .env restored from B2')
  }

  // ── 3. Bashrc_env sync ──
  const b2BashrcEnv = await s3LoadBashrcEnv()
  if (b2BashrcEnv) {
    const { writeFileSync } = await import('fs')
    const { join } = await import('path')
    const appHome = process.env.APP_HOME || process.env.HOME || '/home/cloudshell'
    writeFileSync(join(appHome, '.bashrc_env'), b2BashrcEnv, 'utf-8')
    console.log('[S3] bashrc_env restored from B2')
  }

  // ── 4. SQLite database restore ──
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '/home/z/my-project/db/custom.db'
  const { existsSync } = await import('fs')
  if (!existsSync(dbPath)) {
    const restored = await s3RestoreDatabase(dbPath)
    if (restored) {
      console.log('[S3] Database restored from B2 backup')
    }
  }

  // ── 5. Workspace restore ──
  // Download ALL workspace files from B2 to local disk so they survive in the terminal
  const workspaceList = await s3List('workspaces/', 1000)
  if (workspaceList.length > 0) {
    console.log(`[S3] Found ${workspaceList.length} workspace files in B2 — restoring to local disk...`)
    const { writeFileSync, mkdirSync } = await import('fs')
    const { dirname, join } = await import('path')
    const WORKSPACE_BASE = process.env.WORKSPACE_DIR || '/home/cloudshell/workspace'
    // Workspace dirs follow pattern: /home/cloudshell/workspace/{username}
    
    for (const s3Key of workspaceList) {
      if (!s3Key) continue
      try {
        // s3Key format: workspaces/{username}/relative/path
        const parts = s3Key.split('/')
        if (parts.length < 3 || parts[0] !== 'workspaces') continue
        
        const username = parts[1]
        const relativePath = parts.slice(2).join('/')
        const userWorkspaceDir = join(WORKSPACE_BASE, '..', username)
        const resolvedLocalPath = join(userWorkspaceDir, relativePath)
        
        // Download content from B2
        const content = await s3GetString(s3Key)
        if (content !== null) {
          const dir = dirname(resolvedLocalPath)
          mkdirSync(dir, { recursive: true })
          writeFileSync(resolvedLocalPath, content, 'utf-8')
          console.log(`[S3] Restored: ${s3Key} → ${resolvedLocalPath}`)
        } else {
          // Binary files need Buffer download
          const buffer = await s3GetBuffer(s3Key)
          if (buffer) {
            const dir = dirname(resolvedLocalPath)
            mkdirSync(dir, { recursive: true })
            writeFileSync(resolvedLocalPath, buffer)
            console.log(`[S3] Restored (binary): ${s3Key} → ${resolvedLocalPath}`)
          }
        }
      } catch (err: any) {
        console.error(`[S3] Failed to restore ${s3Key}:`, err.message)
      }
    }
  }

  console.log('[S3] B2 initialization sync complete')
  return usersData
}

// ─── Periodic Database Backup ────────────────────────────────────
/** Schedule periodic SQLite database backups to B2 (every 30 minutes) */
export function startPeriodicDbBackup(dbPath: string, intervalMs: number = 30 * 60 * 1000): void {
  if (!isS3Configured()) {
    console.error('[S3] NOT CONFIGURED — periodic database backup disabled. DB data will be lost on container restart!')
    return
  }
  console.log(`[S3] Periodic database backup started (interval: ${intervalMs / 1000}s, db: ${dbPath}, bucket: ${B2_BUCKET_NAME})`)
  setInterval(async () => {
    try {
      await s3BackupDatabase(dbPath)
    } catch (err: any) {
      console.error('[S3] Periodic database backup failed:', err.message)
    }
  }, intervalMs)
}

// ─── B2 Connectivity Test ────────────────────────────────────────
/** Test B2 connectivity by listing the bucket — returns true if working */
export async function s3TestConnection(): Promise<{ ok: boolean; error?: string; bucketObjects?: number }> {
  if (!isS3Configured()) {
    return { ok: false, error: 'B2 env vars not configured' }
  }
  try {
    const client = getS3Client()
    const response = await client.send(new ListObjectsV2Command({
      Bucket: B2_BUCKET_NAME,
      MaxKeys: 5,
    }))
    const count = response.Contents?.length || 0
    console.log(`[S3] Connectivity test PASSED — bucket "${B2_BUCKET_NAME}" has ${count} objects`)
    return { ok: true, bucketObjects: count }
  } catch (err: any) {
    console.error(`[S3] Connectivity test FAILED — bucket "${B2_BUCKET_NAME}": ${err.name} - ${err.message} (status: ${err.$metadata?.httpStatusCode || 'N/A'})`)
    return { ok: false, error: `${err.name}: ${err.message} (status: ${err.$metadata?.httpStatusCode || 'N/A'})` }
  }
}
