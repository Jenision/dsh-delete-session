window.__ModuleLoader__.load({id:"dsh-delete-session",factory:require=>{var module={exports:{}};var exports=module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
/** Document-relative route addressed by the browser client. */
const SESSION_DELETE_ROUTE = "/api/session.delete".slice(1);
// src/client/DeleteDialog.tsx
function DeleteSessionDialog({ useDeleteRequest, dismiss, onDeleted, t }) {
	const request = useDeleteRequest((state) => state);
	if (request === null) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeleteConfirmForm, {
		request,
		dismiss,
		onDeleted,
		t
	}, request.sessionId);
}
function DeleteConfirmForm({ request, dismiss, onDeleted, t }) {
	const [deleting, setDeleting] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)(null);
	const close = () => {
		if (deleting) return;
		dismiss();
	};
	const confirm = async () => {
		setDeleting(true);
		setError(null);
		try {
			const response = await fetch(SESSION_DELETE_ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: request.sessionId })
			});
			if (!response.ok) {
				let message = t("dialog.errorGeneric");
				try {
					const data = await response.json();
					if (data?.code === "SESSION_RUNNING") message = t("dialog.errorRunning");
					else if (data?.error) message = data.error;
				} catch {}
				setError(message);
				setDeleting(false);
				return;
			}
			setDeleting(false);
			onDeleted?.(request.sessionId);
			dismiss();
		} catch (err) {
			setDeleting(false);
			setError(err instanceof Error ? err.message : t("dialog.errorGeneric"));
		}
	};
	const title = request.displayTitle || String(request.sessionId);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
		open: true,
		onClose: close,
		closeLabel: t("dialog.close"),
		title: t("dialog.title"),
		description: t("dialog.description", { title }),
		footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			disabled: deleting,
			onClick: close,
			children: t("dialog.cancel")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
			variant: "outline",
			disabled: deleting,
			style: {
				color: "var(--color-danger, #dc2626)",
				borderColor: "var(--color-danger, #dc2626)"
			},
			onClick: () => {
				confirm();
			},
			children: deleting ? t("dialog.deleting") : t("dialog.confirm")
		})] }),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			style: {
				fontSize: "12px",
				opacity: .72,
				marginBottom: error ? "8px" : "0"
			},
			children: t("dialog.sessionId", { sessionId: String(request.sessionId) })
		}), error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			role: "alert",
			style: {
				color: "var(--color-danger, #dc2626)",
				fontSize: "13px",
				marginTop: "6px"
			},
			children: error
		})]
	});
}
// src/client/locales.ts
const NS = "delete-session";
const zh = {
	"menu.delete": "永久删除对话…",
	"dialog.title": "永久删除对话",
	"dialog.description": "确定要永久删除对话「{title}」吗？此操作将从磁盘移除会话日志与缓存，且无法恢复。",
	"dialog.sessionId": "会话 ID：{sessionId}",
	"dialog.confirm": "确认删除",
	"dialog.deleting": "正在删除…",
	"dialog.cancel": "取消",
	"dialog.close": "关闭",
	"dialog.errorRunning": "该对话正在运行中，请先停止后再删除。",
	"dialog.errorGeneric": "删除对话失败，请重试。"
};
const en = {
	"menu.delete": "Delete permanently…",
	"dialog.title": "Delete conversation permanently",
	"dialog.description": "Are you sure you want to permanently delete \"{title}\"? This removes the session logs and cache from disk and cannot be undone.",
	"dialog.sessionId": "Session ID: {sessionId}",
	"dialog.confirm": "Delete permanently",
	"dialog.deleting": "Deleting…",
	"dialog.cancel": "Cancel",
	"dialog.close": "Close",
	"dialog.errorRunning": "This conversation is currently running. Please stop it first.",
	"dialog.errorGeneric": "Failed to delete conversation. Please try again."
};
// src/client/index.ts
const inject = [
	"slots",
	"locale",
	"contextMenus"
];
function apply(ctx) {
	const deleteRequest = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(null);
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "delete-session: locale");
	const t = ctx.locale.bind(NS);
	ctx.slots.inject("contextMenu.icon", function* () {
		yield ctx.slots.register({
			name: "contextMenu.icon",
			key: "delete-session.trash"
		}, _deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular);
	});
	ctx.effect(() => ctx.contextMenus.register({
		id: "delete-session.delete",
		target: "session",
		order: 650,
		observe: () => [ctx.locale],
		resolve: (target) => [{
			id: "delete",
			label: t("menu.delete"),
			icon: { key: "delete-session.trash" },
			danger: true,
			separatorBefore: true,
			afterContent: true,
			run: () => {
				deleteRequest.set({
					sessionId: target.sessionId,
					displayTitle: target.displayTitle
				});
			}
		}]
	}), "delete-session: session menu item");
	ctx.slots.inject("shell.overlay", () => ctx.slots.register({
		name: "shell.overlay",
		id: "delete-session.confirm-dialog",
		locale: NS,
		inject: () => ({
			hooks: { deleteRequest },
			dismiss: () => {
				deleteRequest.set(null);
			}
		})
	}, DeleteSessionDialog));
}
exports.apply = apply;
exports.inject = inject;

return module.exports}});
