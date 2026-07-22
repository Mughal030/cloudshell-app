/**
 * B2 Direct Upload Test — bypasses the app to verify B2 connectivity independently
 * Uses the same env vars and S3 client config as s3-storage.ts
 */
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'

const B2_KEY_ID = process.env.B2_KEY_ID || ''
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || ''
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'cloudshell-app-storage'
const B2_ENDPOINT = process.env.B2_ENDPOINT || 's3.us-east-005.backblazeb2.com'
const B2_REGION = B2_ENDPOINT.replace(/^s3\./, '').replace(/\.backblazeb2\.com$/, '') || 'us-east-005'

console.log('=== B2 Direct Upload Test ===')
console.log(`B2_KEY_ID:         ${B2_KEY_ID ? B2_KEY_ID.substring(0, 8) + '...' : '*** MISSING ***'}`)
console.log(`B2_APPLICATION_KEY: ${B2_APPLICATION_KEY ? '***present***' : '*** MISSING ***'}`)
console.log(`B2_BUCKET_NAME:     ${B2_BUCKET_NAME}`)
console.log(`B2_ENDPOINT:        ${B2_ENDPOINT}`)
console.log(`B2_REGION:          ${B2_REGION}`)

if (!B2_KEY_ID || !B2_APPLICATION_KEY) {
  console.error('ERROR: B2_KEY_ID or B2_APPLICATION_KEY not set. Cannot test.')
  process.exit(1)
}

const client = new S3Client({
  endpoint: `https://${B2_ENDPOINT}`,
  region: B2_REGION,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
  forcePathStyle: true,
})

async function testUpload() {
  // Step 1: List current objects in bucket
  console.log('\n--- Step 1: List current bucket objects ---')
  try {
    const listResult = await client.send(new ListObjectsV2Command({
      Bucket: B2_BUCKET_NAME,
      MaxKeys: 20,
    }))
    const objects = listResult.Contents || []
    console.log(`Bucket "${B2_BUCKET_NAME}" currently has ${objects.length} objects:`)
    for (const obj of objects) {
      console.log(`  - ${obj.Key} (${obj.Size} bytes)`)
    }
  } catch (err: any) {
    console.error(`List FAILED: ${err.name} - ${err.message} (status: ${err.$metadata?.httpStatusCode})`)
    console.error('This likely means wrong credentials, wrong bucket name, or wrong endpoint.')
    process.exit(1)
  }

  // Step 2: Upload a test file
  console.log('\n--- Step 2: Upload test file ---')
  const testKey = 'test/b2-upload-verify.html'
  const testContent = `<!DOCTYPE html>
<html>
<head><title>B2 Upload Verification Test</title></head>
<body>
<h1>Backblaze B2 Upload Test - SUCCESS!</h1>
<p>This file was uploaded directly via the AWS S3 SDK to verify B2 connectivity.</p>
<p>Timestamp: ${new Date().toISOString()}</p>
<p>Bucket: ${B2_BUCKET_NAME}</p>
<p>Endpoint: ${B2_ENDPOINT}</p>
</body>
</html>`

  try {
    const putResult = await client.send(new PutObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from(testContent, 'utf-8'),
      ContentType: 'text/html',
    }))
    console.log(`Upload SUCCESS: ${testKey} → ETag: ${putResult.ETag}`)
  } catch (err: any) {
    console.error(`Upload FAILED: ${err.name} - ${err.message} (status: ${err.$metadata?.httpStatusCode})`)
    console.error(`Full error: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`)
    process.exit(1)
  }

  // Step 3: Verify the file exists by listing again
  console.log('\n--- Step 3: Verify file in bucket ---')
  try {
    const listResult2 = await client.send(new ListObjectsV2Command({
      Bucket: B2_BUCKET_NAME,
      MaxKeys: 20,
    }))
    const objects2 = listResult2.Contents || []
    console.log(`Bucket now has ${objects2.length} objects:`)
    for (const obj of objects2) {
      console.log(`  - ${obj.Key} (${obj.Size} bytes)`)
    }
    
    const found = objects2.some(o => o.Key === testKey)
    if (found) {
      console.log('\n✅ VERIFIED: Test file found in B2 bucket!')
    } else {
      console.error('\n❌ ERROR: Test file NOT found in B2 bucket!')
    }
  } catch (err: any) {
    console.error(`Verify FAILED: ${err.name} - ${err.message}`)
  }

  console.log('\n=== Test Complete ===')
}

testUpload().catch(err => {
  console.error('Test script crashed:', err)
  process.exit(1)
})
