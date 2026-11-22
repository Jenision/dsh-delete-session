import { brandString } from "@deepseek-ai/dsh-brand";
import { readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
// src/routes.ts
/** Absolute pathname registered on the Host connection router. */
const SESSION_DELETE_PATH = "/api/session.delete";
SESSION_DELETE_PATH.slice(1);
// src/index.ts
const name = "delete-session";
const inject = ["connection"];
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
function getDshHome() {
	return process.env["DSH_HOME"] || join(homedir(), ".dsh");
}
function isNotFoundError(err) {
	return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}
function isInsideRoot(targetPath, rootPath) {
	let normalizedTarget = resolve(targetPath);
	let normalizedRoot = resolve(rootPath);
	if (process.platform === "win32") {
		normalizedTarget = normalizedTarget.toLowerCase();
		normalizedRoot = normalizedRoot.toLowerCase();
	}
	return normalizedTarget.startsWith(normalizedRoot + sep);
}
function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" }
	});
}
async function isSessionRunning(ctx, sessionId) {
	const active = ctx.get("sessions")?.get?.(sessionId);
	if (active !== void 0) {
		const status = active.agent?.status ?? active.status;
		if (status === "running" || status === "busy" || status === "streaming") return true;
	}
	const registry = ctx.get("workspaceRegistry");
	if (registry?.sessionActivity) {
		const activity = registry.sessionActivity(sessionId);
		if (Array.isArray(activity) && activity.length > 0) return true;
	}
	return false;
}
async function disposeIdleSession(ctx, sessionId) {
	const sessions = ctx.get("sessions");
	try {
		if (typeof sessions?.dispose === "function") await sessions.dispose(sessionId);
		else {
			const session = sessions?.get?.(sessionId);
			if (typeof session?.dispose === "function") await session.dispose();
		}
	} catch {}
}
async function removeSessionLogs(ctx, sessionId, dshHome) {
	let removed = false;
	const sessionsRoot = join(dshHome, "sessions");
	const persistence = ctx?.get("sessionPersistence");
	if (persistence?.stat) {
		let locPath;
		try {
			locPath = (await persistence.stat(sessionId))?.location?.path;
		} catch {}
		if (locPath) {
			const candidateDir = dirname(locPath);
			const realSessionsRoot = await realpath(sessionsRoot).catch((err) => {
				if (isNotFoundError(err)) return resolve(sessionsRoot);
				throw err;
			});
			const realCandidate = await realpath(candidateDir).catch((err) => {
				if (isNotFoundError(err)) return null;
				throw err;
			});
			if (realCandidate && isInsideRoot(realCandidate, realSessionsRoot) && basename(realCandidate) === sessionId) {
				await rm(realCandidate, {
					recursive: true,
					force: true
				});
				removed = true;
			}
		}
	}
	let realSessionsRoot;
	try {
		realSessionsRoot = await realpath(sessionsRoot);
	} catch (err) {
		if (isNotFoundError(err)) return removed;
		throw err;
	}
	const projectEntries = await readdir(realSessionsRoot, { withFileTypes: true });
	for (const entry of projectEntries) {
		if (!entry.isDirectory()) continue;
		const candidate = join(realSessionsRoot, entry.name, sessionId);
		if (!isInsideRoot(candidate, realSessionsRoot)) continue;
		let realCandidate;
		try {
			realCandidate = await realpath(candidate);
		} catch (err) {
			if (isNotFoundError(err)) continue;
			throw err;
		}
		if (!isInsideRoot(realCandidate, realSessionsRoot)) continue;
		await rm(realCandidate, {
			recursive: true,
			force: true
		});
		removed = true;
	}
	return removed;
}
async function removeProjectionCache(sessionId, dshHome) {
	const projCacheDir = join(dshHome, "storages", "session_projcache", "sessions");
	const candidates = [
		join(projCacheDir, `${sessionId}.json`),
		join(projCacheDir, `${sessionId}.json.bak`),
		join(projCacheDir, `${sessionId}.json.tmp`)
	];
	await Promise.all(candidates.map((file) => rm(file, { force: true })));
}
function pruneWorkspaceData(data, sessionId) {
	let changed = false;
	if (Array.isArray(data.global?.archivedSessionIds)) {
		const next = data.global.archivedSessionIds.filter((id) => id !== sessionId);
		if (next.length !== data.global.archivedSessionIds.length) {
			data.global.archivedSessionIds = next;
			changed = true;
		}
	}
	if (Array.isArray(data.global?.pinnedSessionIds)) {
		const next = data.global.pinnedSessionIds.filter((id) => id !== sessionId);
		if (next.length !== data.global.pinnedSessionIds.length) {
			data.global.pinnedSessionIds = next;
			changed = true;
		}
	}
	if (data.tables?.workspaces) {
		for (const ws of Object.values(data.tables.workspaces)) if (Array.isArray(ws.sessionIds)) {
			const next = ws.sessionIds.filter((id) => id !== sessionId);
			if (next.length !== ws.sessionIds.length) {
				ws.sessionIds = next;
				changed = true;
			}
		}
	}
	return changed;
}
async function detachFromWorkspaces(ctx, sessionId, dshHome) {
	const registry = ctx?.get("workspaceRegistry");
	await registry?.unpinSession?.(sessionId).catch(() => void 0);
	await registry?.unarchiveSession?.(sessionId).catch(() => void 0);
	const storages = ctx?.get("storages");
	let updatedViaStorages = false;
	if (storages?.open) try {
		const domain = await storages.open("workspace");
		if (typeof domain?.update === "function") {
			await domain.update((data) => {
				pruneWorkspaceData(data, sessionId);
				return data;
			});
			updatedViaStorages = true;
		} else if (typeof domain?.get === "function" && typeof domain?.set === "function") {
			const data = structuredClone(domain.get());
			if (pruneWorkspaceData(data, sessionId)) await domain.set(data);
			updatedViaStorages = true;
		}
	} catch {}
	if (!updatedViaStorages) {
		const wsFile = join(dshHome, "storages", "workspace.json");
		try {
			const raw = await readFile(wsFile, "utf8");
			const data = JSON.parse(raw);
			if (pruneWorkspaceData(data, sessionId)) await writeFile(wsFile, JSON.stringify(data, null, 2), "utf8");
		} catch (err) {
			if (!isNotFoundError(err)) throw err;
		}
	}
}
function apply(ctx) {
	const connection = Reflect.get(ctx, "connection");
	if (!connection?.fetch?.register) return;
	const deletingSessions = /* @__PURE__ */ new Set();
	const disposeRoute = connection.fetch.register({
		path: SESSION_DELETE_PATH,
		methods: ["POST"],
		requestBody: "buffered",
		fetch: async (request) => {
			let payload;
			try {
				payload = await request.json();
			} catch {
				return jsonResponse({
					code: "INVALID_JSON",
					error: "Invalid JSON request body"
				}, 400);
			}
			const rawId = typeof payload === "object" && payload !== null ? payload["sessionId"] : void 0;
			if (typeof rawId !== "string" || !SESSION_ID_RE.test(rawId)) return jsonResponse({
				code: "INVALID_SESSION_ID",
				error: "Invalid or missing sessionId"
			}, 400);
			if (deletingSessions.has(rawId)) return jsonResponse({
				code: "DELETE_IN_PROGRESS",
				error: "Deletion is already in progress for this conversation."
			}, 409);
			const sessionId = brandString(rawId);
			if (await isSessionRunning(ctx, sessionId)) return jsonResponse({
				code: "SESSION_RUNNING",
				error: "Cannot delete a running conversation. Please stop it first."
			}, 409);
			deletingSessions.add(rawId);
			try {
				await disposeIdleSession(ctx, sessionId);
				const dshHome = getDshHome();
				await detachFromWorkspaces(ctx, sessionId, dshHome);
				await removeProjectionCache(rawId, dshHome);
				const removedLogs = await removeSessionLogs(ctx, sessionId, dshHome);
				try {
					ctx.emit("api-session/removed", sessionId);
				} catch {}
				return jsonResponse({
					ok: true,
					sessionId: rawId,
					removedLogs
				}, 200);
			} catch (err) {
				return jsonResponse({
					code: "DELETE_FAILED",
					error: err instanceof Error ? err.message : "Failed to delete conversation"
				}, 500);
			} finally {
				deletingSessions.delete(rawId);
			}
		}
	});
	ctx.effect(() => disposeRoute, "delete-session: http route");
}
export { SESSION_ID_RE, apply, detachFromWorkspaces, inject, isInsideRoot, name, pruneWorkspaceData, removeProjectionCache, removeSessionLogs };
