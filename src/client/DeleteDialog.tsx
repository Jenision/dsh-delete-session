import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsHooks, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_ROUTE } from '../routes.ts'
import type { NS } from './locales.ts'

const DELETE_TIMEOUT_MS = 15_000

export interface DeleteRequest {
  readonly sessionId: SessionId
  readonly displayTitle: string
}

export interface DeleteDialogInjected {
  readonly hooks: {
    readonly deleteRequest: SnapshotStore<DeleteRequest | null>
  }
  readonly dismiss: () => void
  readonly onDeleted?: (sessionId: SessionId) => void
}

export type DeleteDialogProps = PropsHooks<DeleteDialogInjected['hooks']>
  & Omit<DeleteDialogInjected, 'hooks'>
  & PropsLocale<typeof NS>

export function DeleteSessionDialog({
  useDeleteRequest,
  dismiss,
  onDeleted,
  t,
}: DeleteDialogProps) {
  const request = useDeleteRequest(state => state)
  if (request === null) return null

  return (
    <DeleteConfirmForm
      key={request.sessionId}
      request={request}
      dismiss={dismiss}
      onDeleted={onDeleted}
      t={t}
    />
  )
}

function DeleteConfirmForm({
  request,
  dismiss,
  onDeleted,
  t,
}: {
  request: DeleteRequest
  dismiss: () => void
  onDeleted?: (sessionId: SessionId) => void
  t: DeleteDialogProps['t']
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const close = () => {
    if (deleting) return
    dismiss()
  }

  const confirm = async () => {
    if (deleting) return
    setDeleting(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort('timeout'), DELETE_TIMEOUT_MS)

    try {
      const response = await fetch(SESSION_DELETE_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: request.sessionId }),
        signal: controller.signal,
      })
      if (!response.ok) {
        let message = t('dialog.errorGeneric')
        try {
          const data = (await response.json()) as { code?: string; error?: string }
          if (data?.code === 'SESSION_RUNNING') {
            message = t('dialog.errorRunning')
          } else if (data?.code === 'DELETE_IN_PROGRESS') {
            message = t('dialog.errorInProgress')
          } else if (data?.code === 'INVALID_SESSION_ID') {
            message = t('dialog.errorInvalidId')
          } else if (data?.error) {
            message = data.error
          }
        } catch {
          // Ignore non-JSON error body.
        }
        if (mountedRef.current) {
          setError(message)
          setDeleting(false)
        }
        return
      }
      if (mountedRef.current) {
        setDeleting(false)
        onDeleted?.(request.sessionId)
        dismiss()
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return
      setDeleting(false)
      if (controller.signal.aborted && controller.signal.reason === 'timeout') {
        setError(t('dialog.errorTimeout'))
      } else {
        setError(err instanceof Error ? err.message : t('dialog.errorGeneric'))
      }
    } finally {
      clearTimeout(timeoutId)
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }

  const title = request.displayTitle || String(request.sessionId)
  const dangerButtonStyle = {
    color: 'var(--color-danger, #dc2626)',
    '--dsh-button-outline-color': 'var(--color-danger, #dc2626)',
  } as CSSProperties

  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('dialog.close')}
      title={t('dialog.title')}
      description={t('dialog.description', { title })}
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={close}>
            {t('dialog.cancel')}
          </Button>
          <Button
            variant="outline"
            disabled={deleting}
            style={dangerButtonStyle}
            onClick={() => { void confirm() }}
          >
            {deleting ? t('dialog.deleting') : t('dialog.confirm')}
          </Button>
        </>
      )}
    >
      <div style={{ fontSize: '12px', opacity: 0.72, marginBottom: error ? '8px' : '0' }}>
        {t('dialog.sessionId', { sessionId: String(request.sessionId) })}
      </div>
      {error !== null && (
        <div
          role="alert"
          style={{
            color: 'var(--color-danger, #dc2626)',
            fontSize: '13px',
            marginTop: '6px',
          }}
        >
          {error}
        </div>
      )}
    </Modal>
  )
}
