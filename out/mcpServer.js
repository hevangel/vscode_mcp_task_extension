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
exports.MCPServer = void 0;
const WebSocket = __importStar(require("ws"));
const vscode = __importStar(require("vscode"));
const taskProvider_1 = require("./taskProvider");
const mcpTools_1 = require("./mcpTools");
const logger_1 = require("./logger");
class MCPServer {
    constructor(config) {
        this.clients = new Set();
        this.config = config;
        this.logger = logger_1.Logger.getInstance();
        this.taskProvider = new taskProvider_1.TaskProvider();
        this.mcpTools = new mcpTools_1.MCPTools(this.taskProvider);
    }
    async start() {
        if (this.server) {
            throw new Error('MCP Server is already running');
        }
        try {
            this.server = new WebSocket.Server({
                port: this.config.port,
                host: '0.0.0.0'
            });
            this.server.on('connection', (ws) => {
                this.handleClientConnection(ws);
            });
            this.server.on('error', (error) => {
                this.logger.error('MCP Server error', { error: error.message });
                vscode.window.showErrorMessage(`MCP Server error: ${error.message}`);
            });
            this.logger.info(`MCP Server started on port ${this.config.port}`);
            vscode.window.showInformationMessage(`MCP Task Server started on port ${this.config.port}`);
        }
        catch (error) {
            this.logger.error('Failed to start MCP Server', {
                error: error instanceof Error ? error.message : error
            });
            throw new Error(`Failed to start MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async stop() {
        if (!this.server) {
            return;
        }
        // Close all client connections
        for (const client of this.clients) {
            client.close();
        }
        this.clients.clear();
        // Close server
        return new Promise((resolve) => {
            this.server.close(() => {
                this.server = undefined;
                this.logger.info('MCP Server stopped');
                vscode.window.showInformationMessage('MCP Task Server stopped');
                resolve();
            });
        });
    }
    isRunning() {
        return this.server !== undefined;
    }
    handleClientConnection(ws) {
        this.clients.add(ws);
        this.logger.info('New MCP client connected', {
            clientCount: this.clients.size
        });
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await this.handleMessage(ws, message);
            }
            catch (error) {
                this.logger.error('Error parsing client message', {
                    error: error instanceof Error ? error.message : error
                });
                this.sendError(ws, null, -32700, 'Parse error');
            }
        });
        ws.on('close', () => {
            this.clients.delete(ws);
            this.logger.info('MCP client disconnected', {
                clientCount: this.clients.size
            });
        });
        ws.on('error', (error) => {
            this.logger.error('Client connection error', {
                error: error.message
            });
        });
        // Send initialization
        this.sendNotification(ws, 'initialized', {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {}
            },
            serverInfo: {
                name: 'VSCode MCP Task Server',
                version: '1.0.0'
            }
        });
    }
    async handleMessage(ws, message) {
        // Handle notifications (no response expected)
        if (!('id' in message)) {
            await this.handleNotification(ws, message);
            return;
        }
        // Handle requests (response expected)
        const request = message;
        this.logger.debug(`Handling MCP request: ${request.method}`, {
            id: request.id,
            params: request.params
        });
        try {
            const result = await this.handleRequest(request);
            this.sendResponse(ws, request.id, result);
        }
        catch (error) {
            this.logger.error(`Error handling request ${request.method}`, {
                id: request.id,
                error: error instanceof Error ? error.message : error
            });
            this.sendError(ws, request.id, -32603, error instanceof Error ? error.message : 'Internal error');
        }
    }
    async handleRequest(request) {
        switch (request.method) {
            case 'initialize':
                return this.handleInitialize(request.params);
            case 'tools/list':
                return this.handleToolsList();
            case 'tools/call':
                return this.handleToolsCall(request.params);
            case 'ping':
                return { pong: true };
            default:
                throw new Error(`Unknown method: ${request.method}`);
        }
    }
    async handleNotification(ws, notification) {
        this.logger.debug(`Handling MCP notification: ${notification.method}`, {
            params: notification.params
        });
        switch (notification.method) {
            case 'notifications/initialized':
                // Client has initialized
                this.logger.info('Client initialized');
                break;
            default:
                this.logger.warn(`Unknown notification method: ${notification.method}`);
        }
    }
    async handleInitialize(params) {
        return {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {}
            },
            serverInfo: {
                name: 'VSCode MCP Task Server',
                version: '1.0.0'
            }
        };
    }
    async handleToolsList() {
        const tools = this.mcpTools.getAvailableTools();
        return { tools };
    }
    async handleToolsCall(params) {
        if (!params || !params.name) {
            throw new Error('Tool name is required');
        }
        const toolCall = {
            name: params.name,
            arguments: params.arguments || {}
        };
        const result = await this.mcpTools.executeTool(toolCall);
        return result;
    }
    sendResponse(ws, id, result) {
        const response = {
            jsonrpc: '2.0',
            id,
            result
        };
        this.sendMessage(ws, response);
    }
    sendError(ws, id, code, message, data) {
        const error = { code, message, data };
        const response = {
            jsonrpc: '2.0',
            id: id || 0,
            error
        };
        this.sendMessage(ws, response);
    }
    sendNotification(ws, method, params) {
        const notification = {
            jsonrpc: '2.0',
            method,
            params
        };
        this.sendMessage(ws, notification);
    }
    sendMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
            this.logger.debug('Sent MCP message', { method: message.method || 'response' });
        }
    }
    // Broadcast to all connected clients
    broadcast(message) {
        for (const client of this.clients) {
            this.sendMessage(client, message);
        }
    }
    getClientCount() {
        return this.clients.size;
    }
    getServerInfo() {
        return {
            running: this.isRunning(),
            port: this.config.port,
            clientCount: this.getClientCount(),
            uptime: this.server ? Date.now() : 0
        };
    }
}
exports.MCPServer = MCPServer;
//# sourceMappingURL=mcpServer.js.map