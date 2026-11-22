export const NS = 'delete-session' as const

export const zh = {
  'menu.delete': '永久删除对话…',
  'dialog.title': '永久删除对话',
  'dialog.description': '确定要永久删除对话「{title}」吗？此操作将从磁盘移除会话日志与缓存，且无法恢复。',
  'dialog.sessionId': '会话 ID：{sessionId}',
  'dialog.confirm': '确认删除',
  'dialog.deleting': '正在删除…',
  'dialog.cancel': '取消',
  'dialog.close': '关闭',
  'dialog.errorRunning': '该对话正在运行中，请先停止后再删除。',
  'dialog.errorInProgress': '该对话正在删除中，请勿重复操作。',
  'dialog.errorInvalidId': '无效的会话 ID，无法删除。',
  'dialog.errorTimeout': '删除请求超时，请检查服务状态后重试。',
  'dialog.errorGeneric': '删除对话失败，请重试。',
} as const

export const en = {
  'menu.delete': 'Delete permanently…',
  'dialog.title': 'Delete conversation permanently',
  'dialog.description': 'Are you sure you want to permanently delete "{title}"? This removes the session logs and cache from disk and cannot be undone.',
  'dialog.sessionId': 'Session ID: {sessionId}',
  'dialog.confirm': 'Delete permanently',
  'dialog.deleting': 'Deleting…',
  'dialog.cancel': 'Cancel',
  'dialog.close': 'Close',
  'dialog.errorRunning': 'This conversation is currently running. Please stop it first.',
  'dialog.errorInProgress': 'Deletion is already in progress for this conversation.',
  'dialog.errorInvalidId': 'Invalid session ID. Unable to delete.',
  'dialog.errorTimeout': 'Delete request timed out. Please try again.',
  'dialog.errorGeneric': 'Failed to delete conversation. Please try again.',
} as const

export type DeleteSessionKey = keyof typeof en
