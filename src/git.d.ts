import { Event, Uri } from 'vscode';

export interface Git {
    readonly repositories: Repository[];
    readonly onDidOpenRepository: Event<Repository>;
    readonly onDidCloseRepository: Event<Repository>;
}

export interface Repository {
    readonly rootUri: Uri;
    readonly state: RepositoryState;
}

export interface RepositoryState {
    readonly HEAD: Branch | undefined;
    readonly onDidChange: Event<void>;
}

export interface Branch {
    readonly name?: string;
    readonly commit?: string;
    readonly type?: number;
}

export interface GitExtension {
    getAPI(version: 1): Git;
}
