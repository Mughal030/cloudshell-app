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

// ─── Initialization: Sync B2 data on startup ─────────────────────
/** 
 * On startup, try to load users.json from B2. If it exists,
 * merge it with any local data (B2 takes priority — it's the 
 * persistent source of truth).
 */
export async function s3InitSync(localUsersJson: string | null): Promise<string | null> {
  const b2Users = await s3LoadUsers()
  if (b2Users) {
    console.log('[S3] Found existing users.json in B2 — using cloud data')
    return b2Users
  }
  // No B2 data — upload local data as initial sync
  if (localUsersJson) {
    console.log('[S3] No B2 data found — uploading local users.json as initial sync')
    await s3SaveUsers(localUsersJson)
    return localUsersJson
  }
  return null
}
