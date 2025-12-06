import * as vscode from 'vscode';
import { BranchBeaconProvider } from './branchBeaconProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new BranchBeaconProvider(context.extensionUri);

    context.subscriptions.push(
        provider,
        vscode.window.registerWebviewViewProvider(
            'branchBeacon.branchView',
            provider
        )
    );
}

export function deactivate() {}
