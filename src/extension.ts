import * as vscode from 'vscode';
import { MCPServer } from './mcpServer';
import { Logger } from './logger';
import { MCPServerConfig } from './types';

let mcpServer: MCPServer | undefined;
let logger: Logger;

export function activate(context: vscode.ExtensionContext) {
    logger = Logger.getInstance();
    logger.info('VSCode MCP Task Extension activated');

    // Register commands
    const startCommand = vscode.commands.registerCommand('mcpTaskServer.start', async () => {
        await startMCPServer();
    });

    const stopCommand = vscode.commands.registerCommand('mcpTaskServer.stop', async () => {
        await stopMCPServer();
    });

    const restartCommand = vscode.commands.registerCommand('mcpTaskServer.restart', async () => {
        await stopMCPServer();
        await startMCPServer();
    });

    const showLogsCommand = vscode.commands.registerCommand('mcpTaskServer.showLogs', () => {
        logger.show();
    });

    // Add commands to subscriptions
    context.subscriptions.push(startCommand, stopCommand, restartCommand, showLogsCommand);

    // Auto-start server if configured
    const config = getServerConfig();
    if (config.autoStart) {
        startMCPServer().catch(error => {
            logger.error('Failed to auto-start MCP server', { 
                error: error instanceof Error ? error.message : error 
            });
        });
    }

    // Listen for configuration changes
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('mcpTaskServer')) {
            logger.info('MCP Task Server configuration changed');
            if (mcpServer && mcpServer.isRunning()) {
                vscode.window.showInformationMessage(
                    'MCP Task Server configuration changed. Restart the server to apply changes.',
                    'Restart'
                ).then(selection => {
                    if (selection === 'Restart') {
                        vscode.commands.executeCommand('mcpTaskServer.restart');
                    }
                });
            }
        }
    });

    context.subscriptions.push(configChangeListener);

    // Register status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'mcpTaskServer.showLogs';
    updateStatusBar(statusBarItem);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Update status bar periodically
    const statusUpdateInterval = setInterval(() => {
        updateStatusBar(statusBarItem);
    }, 5000);

    context.subscriptions.push({
        dispose: () => {
            clearInterval(statusUpdateInterval);
        }
    });
}

export function deactivate() {
    logger.info('VSCode MCP Task Extension deactivated');
    
    if (mcpServer) {
        mcpServer.stop().catch(error => {
            logger.error('Error stopping MCP server during deactivation', { 
                error: error instanceof Error ? error.message : error 
            });
        });
    }

    if (logger) {
        logger.dispose();
    }
}

async function startMCPServer(): Promise<void> {
    if (mcpServer && mcpServer.isRunning()) {
        vscode.window.showWarningMessage('MCP Task Server is already running');
        return;
    }

    try {
        const config = getServerConfig();
        mcpServer = new MCPServer(config);
        await mcpServer.start();
        
        logger.info('MCP Task Server started successfully');
        vscode.window.showInformationMessage(
            `MCP Task Server started on port ${config.port}`,
            'Show Logs'
        ).then(selection => {
            if (selection === 'Show Logs') {
                logger.show();
            }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to start MCP Task Server', { error: errorMessage });
        vscode.window.showErrorMessage(`Failed to start MCP Task Server: ${errorMessage}`);
    }
}

async function stopMCPServer(): Promise<void> {
    if (!mcpServer || !mcpServer.isRunning()) {
        vscode.window.showWarningMessage('MCP Task Server is not running');
        return;
    }

    try {
        await mcpServer.stop();
        logger.info('MCP Task Server stopped successfully');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to stop MCP Task Server', { error: errorMessage });
        vscode.window.showErrorMessage(`Failed to stop MCP Task Server: ${errorMessage}`);
    }
}

function getServerConfig(): MCPServerConfig {
    const config = vscode.workspace.getConfiguration('mcpTaskServer');
    return {
        port: config.get<number>('port', 3000),
        enableLogging: config.get<boolean>('enableLogging', true),
        autoStart: config.get<boolean>('autoStart', true)
    };
}

function updateStatusBar(statusBarItem: vscode.StatusBarItem): void {
    const isRunning = mcpServer && mcpServer.isRunning();
    const config = getServerConfig();
    
    if (isRunning) {
        const clientCount = mcpServer!.getClientCount();
        statusBarItem.text = `$(broadcast) MCP Server: ${config.port} (${clientCount} clients)`;
        statusBarItem.tooltip = `MCP Task Server running on port ${config.port} with ${clientCount} connected clients. Click to show logs.`;
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = `$(debug-disconnect) MCP Server: Stopped`;
        statusBarItem.tooltip = 'MCP Task Server is stopped. Click to show logs.';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}
