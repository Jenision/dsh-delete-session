import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  detachFromWorkspaces,
  isInsideRoot,
  pruneWorkspaceData,
  removeProjectionCache,
  removeSessionLogs,
  SESSION_ID_RE,
  type WorkspaceStorageData,
} from '../src/index.ts'

describe('SESSION_ID_RE', () => {
  it('accepts valid session IDs', () => {
    assert.equal(SESSION_ID_RE.test('abc-123_XYZ.01'), true)
    assert.equal(SESSION_ID_RE.test('s1'), true)
  })

  it('rejects empty, traversal, and invalid characters', () => {
    assert.equal(SESSION_ID_RE.test(''), false)
    assert.equal(SESSION_ID_RE.test('..'), false)
    assert.equal(SESSION_ID_RE.test('.hidden'), false)
    assert.equal(SESSION_ID_RE.test('../secret'), false)
    assert.equal(SESSION_ID_RE.test('a/b'), false)
    assert.equal(SESSION_ID_RE.test('a\\b'), false)
  })
})

describe('isInsideRoot', () => {
  it('returns true only for strict descendants', () => {
    assert.equal(isInsideRoot('/tmp/dsh/sessions/proj/s1', '/tmp/dsh/sessions'), true)
    assert.equal(isInsideRoot('/tmp/dsh/sessions', '/tmp/dsh/sessions'), false)
    assert.equal(isInsideRoot('/tmp/dsh/sessions-other/s1', '/tmp/dsh/sessions'), false)
  })
})

describe('pruneWorkspaceData', () => {
  it('removes target session from archived, pinned, and workspace lists', () => {
    const data: WorkspaceStorageData = {
      global: {
        archivedSessionIds: ['s1', 's2'],
        pinnedSessionIds: ['s2', 's3'],
      },
      tables: {
        workspaces: {
          ws1: { path: '/repo1', sessionIds: ['s1', 's2', 's3'] },
          ws2: { path: '/repo2', sessionIds: ['s3'] },
        },
      },
    }

    assert.equal(pruneWorkspaceData(data, 's2'), true)
    assert.deepEqual(data.global.archivedSessionIds, ['s1'])
    assert.deepEqual(data.global.pinnedSessionIds, ['s3'])
    assert.deepEqual(data.tables.workspaces.ws1.sessionIds, ['s1', 's3'])
    assert.deepEqual(data.tables.workspaces.ws2.sessionIds, ['s3'])
    assert.equal(pruneWorkspaceData(data, 's2'), false)
  })
})

describe('filesystem cleanup helpers', () => {
  const createdDirs: string[] = []

  after(async () => {
    await Promise.all(createdDirs.map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('removes session logs, projection cache, and workspace.json references', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-delete-test-'))
    createdDirs.push(dshHome)

    const targetDir = join(dshHome, 'sessions', 'proj-a', 'sess-target')
    const siblingDir = join(dshHome, 'sessions', 'proj-a', 'sess-keep')
    await mkdir(targetDir, { recursive: true })
    await mkdir(siblingDir, { recursive: true })
    await writeFile(join(targetDir, 'events.jsonl'), '{}\n', 'utf8')
    await writeFile(join(siblingDir, 'events.jsonl'), '{}\n', 'utf8')

    const projCacheDir = join(dshHome, 'storages', 'session_projcache', 'sessions')
    await mkdir(projCacheDir, { recursive: true })
    await writeFile(join(projCacheDir, 'sess-target.json'), '{}', 'utf8')
    await writeFile(join(projCacheDir, 'sess-target.json.bak'), '{}', 'utf8')
    await writeFile(join(projCacheDir, 'sess-keep.json'), '{}', 'utf8')

    const wsFile = join(dshHome, 'storages', 'workspace.json')
    await writeFile(wsFile, JSON.stringify({
      global: {
        archivedSessionIds: ['sess-target', 'sess-keep'],
        pinnedSessionIds: ['sess-target'],
      },
      tables: {
        workspaces: {
          default: { path: '/work', sessionIds: ['sess-target', 'sess-keep'] },
        },
      },
    }), 'utf8')

    const targetId = brandString<SessionId>('sess-target')
    await detachFromWorkspaces(undefined, targetId, dshHome)
    await removeProjectionCache('sess-target', dshHome)
    const removed = await removeSessionLogs(undefined, targetId, dshHome)

    assert.equal(removed, true)
    await assert.rejects(() => stat(targetDir), { code: 'ENOENT' })
    await assert.doesNotReject(() => stat(join(siblingDir, 'events.jsonl')))
    await assert.rejects(() => stat(join(projCacheDir, 'sess-target.json')), { code: 'ENOENT' })
    await assert.rejects(() => stat(join(projCacheDir, 'sess-target.json.bak')), { code: 'ENOENT' })
    await assert.doesNotReject(() => stat(join(projCacheDir, 'sess-keep.json')))

    const updatedWs = JSON.parse(await readFile(wsFile, 'utf8')) as WorkspaceStorageData
    assert.deepEqual(updatedWs.global.archivedSessionIds, ['sess-keep'])
    assert.deepEqual(updatedWs.global.pinnedSessionIds, [])
    assert.deepEqual(updatedWs.tables.workspaces.default.sessionIds, ['sess-keep'])
  })
})
