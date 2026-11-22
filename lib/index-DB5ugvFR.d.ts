import { Context } from "@deepseek-ai/cordis";
import { SessionId } from "@deepseek-ai/dsh-session/types";

// src/index.d.ts

declare const name = "delete-session";
declare const inject: string[];
declare const SESSION_ID_RE: RegExp;
interface WorkspaceStorageRecord {
  path: string;
  title?: string;
  sessionIds: string[];
  createdAt?: string;
  updatedAt?: string;
}
interface WorkspaceStorageData {
  unit?: {
    name: string;
    version: number;
  };
  global: {
    initialized?: boolean;
    workspaceIds?: string[];
    archivedSessionIds: string[];
    pinnedSessionIds: string[];
    defaultWorkspaceId?: string;
  };
  tables: {
    workspaces: Record<string, WorkspaceStorageRecord>;
  };
}
declare function isInsideRoot(targetPath: string, rootPath: string): boolean;
declare function removeSessionLogs(ctx: Context | undefined, sessionId: SessionId, dshHome: string): Promise<boolean>;
declare function removeProjectionCache(sessionId: string, dshHome: string): Promise<void>;
declare function pruneWorkspaceData(data: WorkspaceStorageData, sessionId: string): boolean;
declare function detachFromWorkspaces(ctx: Context | undefined, sessionId: SessionId, dshHome: string): Promise<void>;
declare function apply(ctx: Context): void;
export { SESSION_ID_RE, WorkspaceStorageData, WorkspaceStorageRecord, apply, detachFromWorkspaces, inject, isInsideRoot, name, pruneWorkspaceData, removeProjectionCache, removeSessionLogs };