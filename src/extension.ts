import * as vscode from 'vscode';
import { MCPServer } from './mcpServer';
import { Logger } from './logger';
import { MCPServerConfig } from './types';

let mcpServer: MCPServer | undefined;
let logger: Logger;
let mcpServerProvider: vscode.Disposable | undefined;

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
            if (mcpServer && mcpServer.isServerRunning()) {
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

    // Register MCP Server with VSCode
    registerMCPServerWithVSCode(context);

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

    if (mcpServerProvider) {
        mcpServerProvider.dispose();
    }

    if (logger) {
        logger.dispose();
    }
}

async function startMCPServer(): Promise<void> {
    if (mcpServer && mcpServer.isServerRunning()) {
        vscode.window.showWarningMessage('MCP Task Server is already running');
        return;
    }

    try {
        const config = getServerConfig();
        mcpServer = new MCPServer(config);
        await mcpServer.start();
        
        // Refresh MCP server registration after starting
        refreshMCPServerRegistration();
        
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
    if (!mcpServer || !mcpServer.isServerRunning()) {
        vscode.window.showWarningMessage('MCP Task Server is not running');
        return;
    }

    try {
        await mcpServer.stop();
        
        // Refresh MCP server registration after stopping
        refreshMCPServerRegistration();
        
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

function registerMCPServerWithVSCode(context: vscode.ExtensionContext): void {
    try {
        // Check if the language model API supports MCP server registration
        if ('lm' in vscode && 'registerMcpServerDefinitionProvider' in vscode.lm) {
            const provider = (vscode.lm as any).registerMcpServerDefinitionProvider(
                'mcpTaskServerProvider',
                {
                    async provideMcpServerDefinitions(): Promise<any[]> {
                        const config = getServerConfig();
                        const isServerRunning = mcpServer && mcpServer.isServerRunning();
                        
                        if (!isServerRunning) {
                            return [];
                        }

                        return [{
                            id: 'vscode-task-mcp-server',
                            name: 'VSCode Task MCP Server',
                            type: 'http',
                            url: `http://localhost:${config.port}/mcp`,
                            description: 'Provides access to VSCode tasks through MCP protocol'
                        }];
                    }
                }
            );
            
            mcpServerProvider = provider;
            context.subscriptions.push(provider);
            logger.info('MCP Server registered with VSCode language model API');
        } else {
            logger.info('VSCode language model MCP registration API not available');
        }
    } catch (error) {
        logger.warn('Failed to register MCP server with VSCode', { 
            error: error instanceof Error ? error.message : error 
        });
    }
}

function refreshMCPServerRegistration(): void {
    try {
        // Check if there's an API to refresh MCP server registrations
        if ('lm' in vscode && 'refreshMcpServers' in vscode.lm) {
            (vscode.lm as any).refreshMcpServers();
            logger.info('MCP Server registration refreshed');
        } else {
            logger.debug('MCP server refresh API not available');
        }
    } catch (error) {
        logger.warn('Failed to refresh MCP server registration', {
            error: error instanceof Error ? error.message : error
        });
    }
}

function updateStatusBar(statusBarItem: vscode.StatusBarItem): void {
    const isRunning = mcpServer && mcpServer.isServerRunning();
    const config = getServerConfig();
    
    if (isRunning) {
        statusBarItem.text = `$(broadcast) MCP Server: ${config.port}`;
        statusBarItem.tooltip = `MCP Task Server running on port ${config.port} with streamable-http transport. Click to show logs.`;
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = `$(debug-disconnect) MCP Server: Stopped`;
        statusBarItem.tooltip = 'MCP Task Server is stopped. Click to show logs.';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}
