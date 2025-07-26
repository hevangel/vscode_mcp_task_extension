import * as WebSocket from 'ws';
import * as vscode from 'vscode';
import { MCPRequest, MCPResponse, MCPError, MCPNotification, MCPServerConfig } from './types';
import { TaskProvider } from './taskProvider';
import { MCPTools } from './mcpTools';
import { Logger } from './logger';

export class MCPServer {
    private server?: WebSocket.Server;
    private clients: Set<WebSocket> = new Set();
    private taskProvider: TaskProvider;
    private mcpTools: MCPTools;
    private logger: Logger;
    private config: MCPServerConfig;

    constructor(config: MCPServerConfig) {
        this.config = config;
        this.logger = Logger.getInstance();
        this.taskProvider = new TaskProvider();
        this.mcpTools = new MCPTools(this.taskProvider);
    }

    async start(): Promise<void> {
        if (this.server) {
            throw new Error('MCP Server is already running');
        }

        try {
            this.server = new WebSocket.Server({ 
                port: this.config.port,
                host: '0.0.0.0'
            });

            this.server.on('connection', (ws: WebSocket) => {
                this.handleClientConnection(ws);
            });

            this.server.on('error', (error) => {
                this.logger.error('MCP Server error', { error: error.message });
                vscode.window.showErrorMessage(`MCP Server error: ${error.message}`);
            });

            this.logger.info(`MCP Server started on port ${this.config.port}`);
            vscode.window.showInformationMessage(`MCP Task Server started on port ${this.config.port}`);
            
        } catch (error) {
            this.logger.error('Failed to start MCP Server', { 
                error: error instanceof Error ? error.message : error 
            });
            throw new Error(`Failed to start MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async stop(): Promise<void> {
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
            this.server!.close(() => {
                this.server = undefined;
                this.logger.info('MCP Server stopped');
                vscode.window.showInformationMessage('MCP Task Server stopped');
                resolve();
            });
        });
    }

    isRunning(): boolean {
        return this.server !== undefined;
    }

    private handleClientConnection(ws: WebSocket): void {
        this.clients.add(ws);
        this.logger.info('New MCP client connected', { 
            clientCount: this.clients.size 
        });

        ws.on('message', async (data: WebSocket.RawData) => {
            try {
                const message = JSON.parse(data.toString());
                await this.handleMessage(ws, message);
            } catch (error) {
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

    private async handleMessage(ws: WebSocket, message: any): Promise<void> {
        // Handle notifications (no response expected)
        if (!('id' in message)) {
            await this.handleNotification(ws, message as MCPNotification);
            return;
        }

        // Handle requests (response expected)
        const request = message as MCPRequest;
        this.logger.debug(`Handling MCP request: ${request.method}`, { 
            id: request.id,
            params: request.params 
        });

        try {
            const result = await this.handleRequest(request);
            this.sendResponse(ws, request.id, result);
        } catch (error) {
            this.logger.error(`Error handling request ${request.method}`, { 
                id: request.id,
                error: error instanceof Error ? error.message : error 
            });
            this.sendError(ws, request.id, -32603, 
                error instanceof Error ? error.message : 'Internal error');
        }
    }

    private async handleRequest(request: MCPRequest): Promise<any> {
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

    private async handleNotification(ws: WebSocket, notification: MCPNotification): Promise<void> {
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

    private async handleInitialize(params: any): Promise<any> {
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

    private async handleToolsList(): Promise<any> {
        const tools = this.mcpTools.getAvailableTools();
        return { tools };
    }

    private async handleToolsCall(params: any): Promise<any> {
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

    private sendResponse(ws: WebSocket, id: string | number, result: any): void {
        const response: MCPResponse = {
            jsonrpc: '2.0',
            id,
            result
        };

        this.sendMessage(ws, response);
    }

    private sendError(ws: WebSocket, id: string | number | null, code: number, message: string, data?: any): void {
        const error: MCPError = { code, message, data };
        const response: MCPResponse = {
            jsonrpc: '2.0',
            id: id || 0,
            error
        };

        this.sendMessage(ws, response);
    }

    private sendNotification(ws: WebSocket, method: string, params?: any): void {
        const notification: MCPNotification = {
            jsonrpc: '2.0',
            method,
            params
        };

        this.sendMessage(ws, notification);
    }

    private sendMessage(ws: WebSocket, message: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
            this.logger.debug('Sent MCP message', { method: message.method || 'response' });
        }
    }

    // Broadcast to all connected clients
    private broadcast(message: any): void {
        for (const client of this.clients) {
            this.sendMessage(client, message);
        }
    }

    getClientCount(): number {
        return this.clients.size;
    }

    getServerInfo(): any {
        return {
            running: this.isRunning(),
            port: this.config.port,
            clientCount: this.getClientCount(),
            uptime: this.server ? Date.now() : 0
        };
    }
}
