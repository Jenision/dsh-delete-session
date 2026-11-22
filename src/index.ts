/**
 * Host plugin for permanent conversation deletion.
 *
 * Exposes `POST /api/session.delete` on the DSH connection router to:
 * 1. Validate the session ID and refuse deletion if the session is actively running.
 * 2. Dispose any idle in-memory session handle and remove its on-disk JSONL log directory.
 * 3. Remove its projection cache entry (`storages/session_projcache`).
 * 4. Detach the session from workspace lists, pinned lists, and archived lists so the sidebar updates immediately.
 */

import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { SESSION_DELETE_PATH } from './routes.ts'

export const name = 'delete-session'
export const inject = ['connection']

const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/

interface DeleteConnection {
  fetch: {
    register(route: {
      path: string
      methods: string[]
      requestBody?: 'buffered' | 'stream'
      fetch: (request: Request) => Promise<Response>
    }): () => void
  }
}

interface WorkspaceStorageRecord {
  path: string
  title?: string
  sessionIds: string[]
  createdAt?: string
  updatedAt?: string
}

interface WorkspaceStorageData {
  unit?: { name: string; version: number }
  global: {
    initialized?: boolean
    workspaceIds?: string[]
    archivedSessionIds: string[]
    pinnedSessionIds: string[]
    defaultWorkspaceId?: string
  }
  tables: {
    workspaces: Record<string, WorkspaceStorageRecord>
  }
}

function getDshHome(): string {
  return process.env['DSH_HOME'] || join(homedir(), '.dsh')
}

function isInsideRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = resolve(targetPath)
  const normalizedRoot = resolve(rootPath)
  return normalizedTarget.startsWith(normalizedRoot + sep)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function isSessionRunning(ctx: Context, sessionId: SessionId): Promise<boolean> {
  const sessions = ctx.get('sessions') as { get?: (id: SessionId) => { status?: string; agent?: { status?: string } } | undefined } | undefined
  const active = sessions?.get?.(sessionId)
  if (active !== undefined) {
    const status = active.agent?.status ?? active.status
    if (status === 'running' || status === 'busy' || status === 'streaming') {
      return true
    }
  }

  const registry = ctx.get('workspaceRegistry') as {
    sessionActivity?: (id: SessionId) => readonly unknown[]
  } | undefined
  if (registry?.sessionActivity) {
    const activity = registry.sessionActivity(sessionId)
    if (Array.isArray(activity) && activity.length > 0) {
      return true
    }
  }

  return false
}

async function disposeIdleSession(ctx: Context, sessionId: SessionId): Promise<void> {
  const sessions = ctx.get('sessions') as {
    get?: (id: SessionId) => { dispose?: () => Promise<void> | void } | undefined
    dispose?: (id: SessionId) => Promise<void> | void
  } | undefined

  try {
    if (typeof sessions?.dispose === 'function') {
      await sessions.dispose(sessionId)
    } else {
      const session = sessions?.get?.(sessionId)
      if (typeof session?.dispose === 'function') {
        await session.dispose()
      }
    }
  } catch {
    // Best-effort disposal of idle in-memory session handle.
  }
}

async function removeSessionLogs(ctx: Context, sessionId: SessionId, dshHome: string): Promise<boolean> {
  let removed = false
  const sessionsRoot = join(dshHome, 'sessions')

  // 1. Ask sessionPersistence if available to locate the exact log path.
  const persistence = ctx.get('sessionPersistence') as {
    stat?: (id: SessionId) => Promise<{ location?: { path?: string } } | undefined>
  } | undefined
  if (persistence?.stat) {
    try {
      const snapshot = await persistence.stat(sessionId)
      const locPath = snapshot?.location?.path
      if (locPath) {
        const candidateDir = dirname(locPath)
        const realSessionsRoot = await realpath(sessionsRoot).catch(() => resolve(sessionsRoot))
        const realCandidate = await realpath(candidateDir).catch(() => resolve(candidateDir))
        if (isInsideRoot(realCandidate, realSessionsRoot)) {
          await rm(realCandidate, { recursive: true, force: true })
          removed = true
        }
      }
    } catch {
      // Fall through to filesystem scan under $DSH_HOME/sessions.
    }
  }

  // 2. Scan $DSH_HOME/sessions/<project>/<sessionId> as fallback/cleanup.
  try {
    const realSessionsRoot = await realpath(sessionsRoot)
    const projectEntries = await readdir(realSessionsRoot, { withFileTypes: true })
    for (const entry of projectEntries) {
      if (!entry.isDirectory()) continue
      const candidate = join(realSessionsRoot, entry.name, sessionId)
      if (!isInsideRoot(candidate, realSessionsRoot)) continue
      try {
        const realCandidate = await realpath(candidate)
        if (!isInsideRoot(realCandidate, realSessionsRoot)) continue
        await rm(realCandidate, { recursive: true, force: true })
        removed = true
      } catch {
        // Not present in this project directory.
      }
    }
  } catch {
    // sessionsRoot does not exist yet.
  }

  return removed
}

async function removeProjectionCache(sessionId: string, dshHome: string): Promise<void> {
  const projCacheDir = join(dshHome, 'storages', 'session_projcache', 'sessions')
  const candidates = [
    join(projCacheDir, `${sessionId}.json`),
    join(projCacheDir, `${sessionId}.json.bak`),
    join(projCacheDir, `${sessionId}.json.tmp`),
  ]
  await Promise.all(candidates.map(file => rm(file, { force: true }).catch(() => undefined)))
}

async function detachFromWorkspaces(ctx: Context, sessionId: SessionId, dshHome: string): Promise<void> {
  const registry = ctx.get('workspaceRegistry') as {
    unpinSession?: (id: SessionId) => Promise<unknown>
    unarchiveSession?: (id: SessionId) => Promise<unknown>
  } | undefined

  await registry?.unpinSession?.(sessionId).catch(() => undefined)
  await registry?.unarchiveSession?.(sessionId).catch(() => undefined)

  // Update workspace storage via storages service if available, otherwise update workspace.json directly.
  const storages = ctx.get('storages') as {
    open?: (name: string) => Promise<{
      update?: (fn: (data: WorkspaceStorageData) => WorkspaceStorageData | void) => Promise<void>
      get?: () => WorkspaceStorageData
      set?: (data: WorkspaceStorageData) => Promise<void>
    }>
  } | undefined

  const pruneData = (data: WorkspaceStorageData): boolean => {
    let changed = false
    if (Array.isArray(data.global?.archivedSessionIds)) {
      const next = data.global.archivedSessionIds.filter(id => id !== sessionId)
      if (next.length !== data.global.archivedSessionIds.length) {
        data.global.archivedSessionIds = next
        changed = true
      }
    }
    if (Array.isArray(data.global?.pinnedSessionIds)) {
      const next = data.global.pinnedSessionIds.filter(id => id !== sessionId)
      if (next.length !== data.global.pinnedSessionIds.length) {
        data.global.pinnedSessionIds = next
        changed = true
      }
    }
    if (data.tables?.workspaces) {
      for (const ws of Object.values(data.tables.workspaces)) {
        if (Array.isArray(ws.sessionIds)) {
          const next = ws.sessionIds.filter(id => id !== sessionId)
          if (next.length !== ws.sessionIds.length) {
            ws.sessionIds = next
            changed = true
          }
        }
      }
    }
    return changed
  }

  let updatedViaStorages = false
  if (storages?.open) {
    try {
      const domain = await storages.open('workspace')
      if (typeof domain?.update === 'function') {
        await domain.update((data) => {
          pruneData(data)
          return data
        })
        updatedViaStorages = true
      } else if (typeof domain?.get === 'function' && typeof domain?.set === 'function') {
        const data = structuredClone(domain.get())
        if (pruneData(data)) {
          await domain.set(data)
        }
        updatedViaStorages = true
      }
    } catch {
      // Fall back to direct file update below.
    }
  }

  if (!updatedViaStorages) {
    const wsFile = join(dshHome, 'storages', 'workspace.json')
    try {
      const raw = await readFile(wsFile, 'utf8')
      const data = JSON.parse(raw) as WorkspaceStorageData
      if (pruneData(data)) {
        await writeFile(wsFile, JSON.stringify(data, null, 2), 'utf8')
      }
    } catch {
      // workspace.json absent or unreadable.
    }
  }
}

export function apply(ctx: Context): void {
  const connection = Reflect.get(ctx, 'connection') as DeleteConnection | undefined
  if (!connection?.fetch?.register) return

  const disposeRoute = connection.fetch.register({
    path: SESSION_DELETE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request: Request): Promise<Response> => {
      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return jsonResponse({ error: 'Invalid JSON request body' }, 400)
      }

      const rawId = typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)['sessionId']
        : undefined

      if (typeof rawId !== 'string' || !SESSION_ID_RE.test(rawId)) {
        return jsonResponse({
          code: 'INVALID_SESSION_ID',
          error: 'Invalid or missing sessionId',
        }, 400)
      }

      const sessionId = brandString<SessionId>(rawId)

      if (await isSessionRunning(ctx, sessionId)) {
        return jsonResponse({
          code: 'SESSION_RUNNING',
          error: 'Cannot delete a running conversation. Please stop it first.',
        }, 409)
      }

      try {
        await disposeIdleSession(ctx, sessionId)

        const dshHome = getDshHome()
        await removeSessionLogs(ctx, sessionId, dshHome)
        await removeProjectionCache(rawId, dshHome)
        await detachFromWorkspaces(ctx, sessionId, dshHome)

        // Notify any session controller listeners that the session was removed.
        try {
          ;(ctx as unknown as { emit: (event: string, ...args: unknown[]) => void }).emit('api-session/removed', sessionId)
        } catch {
          // Ignore if event signature differs.
        }

        return jsonResponse({ ok: true, sessionId: rawId }, 200)
      } catch (err: unknown) {
        return jsonResponse({
          code: 'DELETE_FAILED',
          error: err instanceof Error ? err.message : 'Failed to delete conversation',
        }, 500)
      }
    },
  })

  ctx.effect(() => disposeRoute, 'delete-session: http route')
}
