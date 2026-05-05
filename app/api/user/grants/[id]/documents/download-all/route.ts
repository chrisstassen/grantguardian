import { NextRequest, NextResponse } from 'next/server'
import { deflateRawSync } from 'zlib'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ── Minimal ZIP builder (no external dependencies) ────────────────────────────
// Uses DEFLATE compression via Node's built-in zlib.deflateRawSync.

function makeCRC32Table(): Uint32Array {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
}
const CRC32_TABLE = makeCRC32Table()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry { name: string; data: Buffer }

function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBuf  = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data, { level: 6 })
    const crc      = crc32(data)
    const compLen  = compressed.length
    const uncompLen = data.length

    // Local file header (30 bytes + name)
    const lh = Buffer.alloc(30 + nameBuf.length)
    lh.writeUInt32LE(0x04034b50, 0)  // signature PK\3\4
    lh.writeUInt16LE(20,          4)  // version needed
    lh.writeUInt16LE(0x0800,      6)  // flags: UTF-8
    lh.writeUInt16LE(8,           8)  // compression: DEFLATE
    lh.writeUInt16LE(0,          10)  // mod time
    lh.writeUInt16LE(0,          12)  // mod date
    lh.writeUInt32LE(crc,        14)
    lh.writeUInt32LE(compLen,    18)
    lh.writeUInt32LE(uncompLen,  22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0,          28)  // extra field length
    nameBuf.copy(lh, 30)

    // Central directory entry (46 bytes + name)
    const cd = Buffer.alloc(46 + nameBuf.length)
    cd.writeUInt32LE(0x02014b50, 0)  // signature PK\1\2
    cd.writeUInt16LE(20,          4)  // version made by
    cd.writeUInt16LE(20,          6)  // version needed
    cd.writeUInt16LE(0x0800,      8)  // flags: UTF-8
    cd.writeUInt16LE(8,          10)  // compression: DEFLATE
    cd.writeUInt16LE(0,          12)  // mod time
    cd.writeUInt16LE(0,          14)  // mod date
    cd.writeUInt32LE(crc,        16)
    cd.writeUInt32LE(compLen,    20)
    cd.writeUInt32LE(uncompLen,  24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0,          30)  // extra field length
    cd.writeUInt16LE(0,          32)  // comment length
    cd.writeUInt16LE(0,          34)  // disk number start
    cd.writeUInt16LE(0,          36)  // internal attributes
    cd.writeUInt32LE(0,          38)  // external attributes
    cd.writeUInt32LE(offset,     42)  // local header offset
    nameBuf.copy(cd, 46)

    localParts.push(lh, compressed)
    centralParts.push(cd)
    offset += lh.length + compLen
  }

  const centralDir    = Buffer.concat(centralParts)
  const centralOffset = offset

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50,         0)  // signature PK\5\6
  eocd.writeUInt16LE(0,                   4)  // disk number
  eocd.writeUInt16LE(0,                   6)  // disk with central dir
  eocd.writeUInt16LE(entries.length,      8)  // entries on this disk
  eocd.writeUInt16LE(entries.length,     10)  // total entries
  eocd.writeUInt32LE(centralDir.length,  12)  // central dir size
  eocd.writeUInt32LE(centralOffset,      16)  // central dir offset
  eocd.writeUInt16LE(0,                  20)  // comment length

  return Buffer.concat([...localParts, centralDir, eocd])
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Download a file from Supabase storage; returns null on failure. */
async function fetchFile(bucket: string, path: string): Promise<Buffer | null> {
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path)
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  } catch {
    return null
  }
}

/** Sanitize a string for use in a file path (no slashes, no special chars). */
function safe(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '_').trim() || 'file'
}

/** Ensure no two entries in the zip share the same name. */
function dedupe(nameSet: Set<string>, proposed: string): string {
  if (!nameSet.has(proposed)) { nameSet.add(proposed); return proposed }
  const ext   = proposed.lastIndexOf('.') > proposed.lastIndexOf('/') ? proposed.slice(proposed.lastIndexOf('.')) : ''
  const base  = proposed.slice(0, proposed.length - ext.length)
  let i = 1
  while (nameSet.has(`${base} (${i})${ext}`)) i++
  const result = `${base} (${i})${ext}`
  nameSet.add(result)
  return result
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authorize(token: string | null, grantId: string) {
  if (!token) return { error: 'Unauthorized', status: 401 as const }
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { error: 'Unauthorized', status: 401 as const }

  const { data: grant } = await supabaseAdmin
    .from('grants')
    .select('id, organization_id, grant_name, award_letter_url, award_letter_name')
    .eq('id', grantId)
    .single()
  if (!grant) return { error: 'Grant not found', status: 404 as const }

  const { data: membership } = await supabaseAdmin
    .from('user_organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', grant.organization_id)
    .single()
  if (!membership) return { error: 'Forbidden', status: 403 as const }

  return { user, grant }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: grantId } = await params
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
  const auth  = await authorize(token, grantId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { grant } = auth
  const entries: ZipEntry[]  = []
  const nameSet = new Set<string>()

  // ── 1. Award Letter ──────────────────────────────────────────────────────
  if (grant.award_letter_url) {
    const buf = await fetchFile('award-letters', grant.award_letter_url)
    if (buf) {
      const name = dedupe(nameSet, `Award Letter/${safe(grant.award_letter_name || 'award-letter')}`)
      entries.push({ name, data: buf })
    }
  }

  // ── 2. General grant documents ───────────────────────────────────────────
  const { data: generalDocs } = await supabaseAdmin
    .from('grant_documents')
    .select('file_name, file_path')
    .eq('grant_id', grantId)

  if (generalDocs?.length) {
    await Promise.all(generalDocs.map(async (d) => {
      const buf = await fetchFile('grant-documents', d.file_path)
      if (buf) {
        const name = dedupe(nameSet, `General Documents/${safe(d.file_name)}`)
        entries.push({ name, data: buf })
      }
    }))
  }

  // ── 3. Expense documents ─────────────────────────────────────────────────
  const { data: expenses } = await supabaseAdmin
    .from('expenses')
    .select('id, vendor, category')
    .eq('grant_id', grantId)

  if (expenses?.length) {
    const expenseIds  = expenses.map((e) => e.id)
    const expenseMap  = new Map(expenses.map((e) => [e.id, e]))

    const { data: expenseDocs } = await supabaseAdmin
      .from('expense_documents')
      .select('file_name, file_path, expense_id')
      .in('expense_id', expenseIds)

    if (expenseDocs?.length) {
      await Promise.all(expenseDocs.map(async (d) => {
        const buf = await fetchFile('expense-documents', d.file_path)
        if (buf) {
          const exp    = expenseMap.get(d.expense_id)
          const folder = exp ? safe([exp.vendor, exp.category].filter(Boolean).join(' - ')) : 'Unknown'
          const name   = dedupe(nameSet, `Expense Documents/${folder}/${safe(d.file_name)}`)
          entries.push({ name, data: buf })
        }
      }))
    }
  }

  // ── 4. Request attachments ────────────────────────────────────────────────
  const { data: grantRequests } = await supabaseAdmin
    .from('reimbursement_requests')
    .select('id, title, request_type')
    .eq('grant_id', grantId)

  if (grantRequests?.length) {
    const requestIds  = grantRequests.map((r) => r.id)
    const requestMap  = new Map(grantRequests.map((r) => [r.id, r]))

    const { data: attachments } = await supabaseAdmin
      .from('grant_request_attachments')
      .select('file_name, file_path, request_id')
      .in('request_id', requestIds)

    if (attachments?.length) {
      await Promise.all(attachments.map(async (d) => {
        const buf = await fetchFile('grant-request-attachments', d.file_path)
        if (buf) {
          const req    = requestMap.get(d.request_id)
          const folder = req ? safe(req.title || req.request_type || 'Request') : 'Unknown'
          const name   = dedupe(nameSet, `Request Attachments/${folder}/${safe(d.file_name)}`)
          entries.push({ name, data: buf })
        }
      }))
    }
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No documents found' }, { status: 404 })
  }

  const zip          = buildZip(entries)
  const zipName      = safe(grant.grant_name || 'grant') + '-documents.zip'

  return new NextResponse(zip.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Content-Length':      String(zip.length),
    },
  })
}
