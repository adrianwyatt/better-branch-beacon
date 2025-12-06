import * as vscode from 'vscode';
import { GitExtension } from './git';

export class BranchBeaconProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(message => {
            if (message.type === 'refresh') {
                console.log('[Branch Beacon] Manual refresh requested');
                this._updateBranch();
            }
        });

        await this._setupGitWatchers();
        this._setupFileWatchers();
        this._setupWindowFocusListener();
        this._updateBranch();
    }

    private async _setupGitWatchers() {
        try {
            const gitExtensionWrapper = vscode.extensions.getExtension<GitExtension>('vscode.git');

            if (!gitExtensionWrapper) {
                return;
            }

            const gitExtension = gitExtensionWrapper.isActive
                ? gitExtensionWrapper.exports
                : await gitExtensionWrapper.activate();

            const git = gitExtension.getAPI(1);

            this._disposables.push(
                git.onDidOpenRepository(() => {
                    console.log('[Branch Beacon] Repository opened');
                    this._updateBranch();
                    this._setupFileWatchers();
                })
            );

            this._disposables.push(
                git.onDidCloseRepository(() => {
                    console.log('[Branch Beacon] Repository closed');
                    this._updateBranch();
                })
            );

            git.repositories.forEach(repo => {
                this._disposables.push(
                    repo.state.onDidChange(() => {
                        console.log('[Branch Beacon] Repository state changed');
                        this._updateBranch();
                    })
                );
            });
        } catch (error) {
            console.error('Failed to setup git watchers:', error);
        }
    }

    private _setupFileWatchers() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        workspaceFolders.forEach(folder => {
            const headPattern = new vscode.RelativePattern(folder, '.git/HEAD');
            const watcher = vscode.workspace.createFileSystemWatcher(headPattern);

            this._disposables.push(watcher);
            this._disposables.push(
                watcher.onDidChange(() => {
                    console.log('[Branch Beacon] .git/HEAD changed - branch switched via command line');
                    this._updateBranch();
                })
            );
        });
    }

    private _setupWindowFocusListener() {
        this._disposables.push(
            vscode.window.onDidChangeWindowState(state => {
                if (state.focused) {
                    console.log('[Branch Beacon] Window focused - refreshing branch');
                    this._updateBranch();
                }
            })
        );
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
    }

    private async _updateBranch() {
        try {
            const gitExtensionWrapper = vscode.extensions.getExtension<GitExtension>('vscode.git');

            if (!gitExtensionWrapper) {
                this._sendBranchUpdate('No Git Extension');
                return;
            }

            const gitExtension = gitExtensionWrapper.isActive
                ? gitExtensionWrapper.exports
                : await gitExtensionWrapper.activate();

            const git = gitExtension.getAPI(1);

            if (!git || git.repositories.length === 0) {
                this._sendBranchUpdate('No repository');
                return;
            }

            const repo = git.repositories[0];
            const head = repo.state.HEAD;

            console.log('[Branch Beacon] Repository state:', {
                hasHead: !!head,
                headName: head?.name,
                headType: head?.type,
                headCommit: head?.commit,
                repoRoot: repo.rootUri.fsPath
            });

            if (!head) {
                console.log('[Branch Beacon] HEAD is undefined - repository might not be initialized');
                this._sendBranchUpdate('No HEAD (uninitialized?)');
                return;
            }

            const branch = head.name || head.commit?.substring(0, 7) || 'Unknown';

            if (!head.name) {
                console.log('[Branch Beacon] HEAD has no name - might be in detached HEAD state');
                this._sendBranchUpdate(`Detached: ${head.commit?.substring(0, 7) || 'Unknown'}`);
                return;
            }

            this._sendBranchUpdate(branch);
        } catch (error) {
            console.error('Failed to update branch:', error);
            this._sendBranchUpdate('Error');
        }
    }

    private _sendBranchUpdate(branch: string) {
        console.log('[Branch Beacon] Sending branch update:', branch, 'View exists:', !!this._view);
        if (this._view) {
            this._view.webview.postMessage({ type: 'updateBranch', branch });
            console.log('[Branch Beacon] Message posted to webview');
        } else {
            console.log('[Branch Beacon] View not ready, cannot send update');
        }
    }

    private _getHtmlForWebview(_webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Branch Beacon</title>
    <style>
        body {
            margin: 0;
            padding: 0px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 10vh;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }

        .branch-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
        }

        .branch-name {
            font-size: 24px;
            font-weight: bold;
            line-height: 1.3;
            word-break: break-word;
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
            text-align: center;
        }

        .refresh-button {
            padding: 4px;
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            cursor: pointer;
            font-size: 16px;
            opacity: 0.6;
            transition: opacity 0.2s;
            flex-shrink: 0;
        }

        .refresh-button:hover {
            opacity: 1;
        }

        .refresh-button:active {
            opacity: 0.4;
        }

        @media (max-width: 400px) {
            .branch-name {
                font-size: 24px;
            }
        }
    </style>
</head>
<body>
    <div class="branch-container">
        <div class="branch-name" id="branchName">Loading...</div>
        <button class="refresh-button" id="refreshButton" title="Refresh branch">↻</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const branchNameEl = document.getElementById('branchName');
        const refreshButton = document.getElementById('refreshButton');

        refreshButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            console.log('[Branch Beacon WebView] Received message:', message);
            if (message.type === 'updateBranch') {
                console.log('[Branch Beacon WebView] Updating branch to:', message.branch);
                const branchWithBreaks = message.branch.replace(/\//g, '/<br>');
                branchNameEl.innerHTML = branchWithBreaks;
            }
        });
    </script>
</body>
</html>`;
    }
}
