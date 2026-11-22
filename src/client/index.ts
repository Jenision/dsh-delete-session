/**
 * Browser plugin for permanent conversation deletion.
 *
 * Registers:
 * - A trash icon in `contextMenu.icon`
 * - A danger "Delete permanently…" item in the `session` context / `…` menu
 * - A confirmation modal in `shell.overlay`
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  DeleteSessionDialog,
  type DeleteDialogInjected,
  type DeleteRequest,
} from './DeleteDialog.tsx'
import { en, NS, zh, type DeleteSessionKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'delete-session': DeleteSessionKey
  }
}

export const inject = ['slots', 'locale', 'contextMenus']

export function apply(ctx: ClientContext): void {
  const deleteRequest = createSnapshotStore<DeleteRequest | null>(null)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'delete-session: locale')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('contextMenu.icon', function* () {
    yield ctx.slots.register({ name: 'contextMenu.icon', key: 'delete-session.trash' }, IconTrashOutlineRegular)
  })

  ctx.effect(() => ctx.contextMenus.register({
    id: 'delete-session.delete',
    target: 'session',
    order: 650,
    observe: () => [ctx.locale],
    resolve: target => [{
      id: 'delete',
      label: t('menu.delete'),
      icon: { key: 'delete-session.trash' },
      danger: true,
      separatorBefore: true,
      afterContent: true,
      run: () => {
        deleteRequest.set({
          sessionId: target.sessionId,
          displayTitle: target.displayTitle,
        })
      },
    }],
  }), 'delete-session: session menu item')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'delete-session.confirm-dialog',
    locale: NS,
    inject: (): DeleteDialogInjected => ({
      hooks: { deleteRequest },
      dismiss: () => { deleteRequest.set(null) },
    }),
  }, DeleteSessionDialog))
}
