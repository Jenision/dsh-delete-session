import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsHooks, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_DELETE_ROUTE } from '../routes.ts'
import type { NS } from './locales.ts'

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

  const close = () => {
    if (deleting) return
    dismiss()
  }

  const confirm = async () => {
    setDeleting(true)
    setError(null)
    try {
      const response = await fetch(SESSION_DELETE_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: request.sessionId }),
      })
      if (!response.ok) {
        let message = t('dialog.errorGeneric')
        try {
          const data = (await response.json()) as { code?: string; error?: string }
          if (data?.code === 'SESSION_RUNNING') {
            message = t('dialog.errorRunning')
          } else if (data?.error) {
            message = data.error
          }
        } catch {
          // Ignore non-JSON error body.
        }
        setError(message)
        setDeleting(false)
        return
      }
      setDeleting(false)
      onDeleted?.(request.sessionId)
      dismiss()
    } catch (err: unknown) {
      setDeleting(false)
      setError(err instanceof Error ? err.message : t('dialog.errorGeneric'))
    }
  }

  const title = request.displayTitle || String(request.sessionId)

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
            style={{
              color: 'var(--color-danger, #dc2626)',
              borderColor: 'var(--color-danger, #dc2626)',
            }}
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
