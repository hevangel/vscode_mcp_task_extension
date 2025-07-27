"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const mcpServer_1 = require("./mcpServer");
const logger_1 = require("./logger");
let mcpServer;
let logger;
function activate(context) {
    logger = logger_1.Logger.getInstance();
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
                vscode.window.showInformationMessage('MCP Task Server configuration changed. Restart the server to apply changes.', 'Restart').then(selection => {
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
function deactivate() {
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
async function startMCPServer() {
    if (mcpServer && mcpServer.isServerRunning()) {
        vscode.window.showWarningMessage('MCP Task Server is already running');
        return;
    }
    try {
        const config = getServerConfig();
        mcpServer = new mcpServer_1.MCPServer(config);
        await mcpServer.start();
        logger.info('MCP Task Server started successfully');
        vscode.window.showInformationMessage(`MCP Task Server started on port ${config.port}`, 'Show Logs').then(selection => {
            if (selection === 'Show Logs') {
                logger.show();
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to start MCP Task Server', { error: errorMessage });
        vscode.window.showErrorMessage(`Failed to start MCP Task Server: ${errorMessage}`);
    }
}
async function stopMCPServer() {
    if (!mcpServer || !mcpServer.isServerRunning()) {
        vscode.window.showWarningMessage('MCP Task Server is not running');
        return;
    }
    try {
        await mcpServer.stop();
        logger.info('MCP Task Server stopped successfully');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to stop MCP Task Server', { error: errorMessage });
        vscode.window.showErrorMessage(`Failed to stop MCP Task Server: ${errorMessage}`);
    }
}
function getServerConfig() {
    const config = vscode.workspace.getConfiguration('mcpTaskServer');
    return {
        port: config.get('port', 3000),
        enableLogging: config.get('enableLogging', true),
        autoStart: config.get('autoStart', true)
    };
}
function updateStatusBar(statusBarItem) {
    const isRunning = mcpServer && mcpServer.isServerRunning();
    const config = getServerConfig();
    if (isRunning) {
        statusBarItem.text = `$(broadcast) MCP Server: ${config.port}`;
        statusBarItem.tooltip = `MCP Task Server running on port ${config.port} with streamable-http transport. Click to show logs.`;
        statusBarItem.backgroundColor = undefined;
    }
    else {
        statusBarItem.text = `$(debug-disconnect) MCP Server: Stopped`;
        statusBarItem.tooltip = 'MCP Task Server is stopped. Click to show logs.';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}
//# sourceMappingURL=extension.js.map