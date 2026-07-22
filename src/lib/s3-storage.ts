/**
 * Backblaze B2 (S3-compatible) Storage Service
 *
 * Provides persistent cloud storage for the CloudShell IDE, replacing
 * ephemeral local disk storage on HuggingFace Spaces.
 *
 * All credentials come from environment variables:
 *   B2_KEY_ID         — Backblaze B2 application key ID
 *   B2_APPLICATION_KEY — Backblaze B2 application key
 *   B2_BUCKET_NAME     — Target bucket name
 *   B2_ENDPOINT        — S3 endpoint (e.g. s3.us-east-005.backblazeb2.com)
 *
 * Architecture:
 *   - User data (users.json, audit.log) → B2 bucket root
 *   - User workspace files → B2 bucket under workspaces/{username}/
 *   - Local disk is still used for workspace directories (terminal needs them)
 *     but critical data is ALSO synced to B2 for persistence
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
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'claude'
const B2_ENDPOINT = process.env.B2_ENDPOINT || 's3.us-east-005.backblazeb2.com'

// Parse region from endpoint (e.g. "us-east-005" from "s3.us-east-005.backblazeb2.com")
const B2_REGION = B2_ENDPOINT.replace(/^s3\./, '').replace(/\.backblazeb2\.com$/, '') || 'us-east-005'

// ─── S3 Client (lazy initialization) ─────────────────────────────
let _s3Client: S3Client | null = null

function isS3Configured(): boolean {
  return !!B2_KEY_ID && !!B2_APPLICATION_KEY && !!B2_BUCKET_NAME && !!B2_ENDPOINT
}

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client
  _s3Client = new S3Client({
    endpoint: `https://${B2_ENDPOINT}`,
    region: B2_REGION,
    credentials: {
      accessKeyId: B2_KEY_ID,
      secretAccessKey: B2_APPLICATION_KEY,
    },
    forcePathStyle: true, // Required for Backblaze B2
  })
  return _s3Client
}

// ─── Core Operations ─────────────────────────────────────────────

/** Upload a string or Buffer to B2 */
export async function s3Put(key: string, data: string | Buffer | Uint8Array, contentType?: string): Promise<void> {
  if (!isS3Configured()) {
    console.warn('[S3] Not configured — skipping upload for key:', key)
    return
  }
  const client = getS3Client()
  await client.send(new PutObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: key,
    Body: typeof data === 'string' ? Buffer.from(data, 'utf-8') : data,
    ContentType: contentType || 'application/octet-stream',
  }))
  console.log(`[S3] Uploaded: ${key} (${typeof data === 'string' ? data.length : (data as Buffer).length} bytes)`)
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
    console.error(`[S3] Download failed for key ${key}:`, err.message)
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
    console.error(`[S3] Download failed for key ${key}:`, err.message)
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
    console.log(`[S3] Deleted: ${key}`)
  } catch (err: any) {
    console.error(`[S3] Delete failed for key ${key}:`, err.message)
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
    console.error(`[S3] Copy failed ${sourceKey} → ${destKey}:`, err.message)
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
    console.error(`[S3] List failed for prefix ${prefix}:`, err.message)
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
  await s3Put(key, content, contentType)
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
 */
export async function s3InitSync(localUsersJson: string | null): Promise<string | null> {
  console.log('[S3] Starting B2 initialization sync...')
  
  // ── 1. Users.json sync ──
  const b2Users = await s3LoadUsers()
  if (b2Users) {
    console.log('[S3] Found existing users.json in B2 — using cloud data')
  } else if (localUsersJson) {
    console.log('[S3] No B2 data found — uploading local users.json as initial sync')
    await s3SaveUsers(localUsersJson)
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
  // Download workspace files from B2 for users who have cloud data
  const workspaceList = await s3List('workspaces/', 500)
  if (workspaceList.length > 0) {
    console.log(`[S3] Found ${workspaceList.length} workspace files in B2 — they'll be downloaded on demand`)
  }

  console.log('[S3] B2 initialization sync complete')
  return usersData
}

// ─── Periodic Database Backup ────────────────────────────────────
/** Schedule periodic SQLite database backups to B2 (every 30 minutes) */
export function startPeriodicDbBackup(dbPath: string, intervalMs: number = 30 * 60 * 1000): void {
  if (!isS3Configured()) {
    console.warn('[S3] Not configured — periodic database backup disabled')
    return
  }
  console.log(`[S3] Periodic database backup started (interval: ${intervalMs / 1000}s, db: ${dbPath})`)
  setInterval(async () => {
    try {
      await s3BackupDatabase(dbPath)
    } catch (err: any) {
      console.error('[S3] Periodic database backup failed:', err.message)
    }
  }, intervalMs)
}
