import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer, type Server } from 'http';
import { z } from 'zod';
import { MCPServerConfig } from './types';
import { TaskProvider } from './taskProvider';
import { Logger } from './logger';

export class MCPServer {
    private mcpServer?: McpServer;
    private httpServer?: Server;
    private taskProvider: TaskProvider;
    private logger: Logger;
    private config: MCPServerConfig;
    private isRunning = false;

    constructor(config: MCPServerConfig) {
        this.config = config;
        this.logger = Logger.getInstance();
        this.taskProvider = new TaskProvider();
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            throw new Error('MCP Server is already running');
        }

        try {
            // Create MCP server instance
            this.mcpServer = new McpServer({
                name: 'vscode-task-server',
                version: '1.0.0'
            });

            // MCP server instance created - tools will be handled via HTTP requests

            // Create HTTP server for streamable-http transport
            this.httpServer = createServer();
            
            // Set up MCP server to handle HTTP requests
            this.httpServer.on('request', async (req, res) => {
                if (req.method === 'POST' && req.url === '/mcp') {
                    await this.handleMCPRequest(req, res);
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not found' }));
                }
            });

            // Start the HTTP server
            await new Promise<void>((resolve, reject) => {
                this.httpServer!.listen(this.config.port, '0.0.0.0', () => {
                    resolve();
                });
                this.httpServer!.on('error', reject);
            });
            
            this.isRunning = true;
            this.logger.info(`MCP Server started with streamable-http transport on port ${this.config.port}`);
            vscode.window.showInformationMessage(`MCP Task Server started on port ${this.config.port}`);
            
        } catch (error) {
            this.logger.error('Failed to start MCP Server', { 
                error: error instanceof Error ? error.message : error 
            });
            throw new Error(`Failed to start MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            if (this.httpServer) {
                await new Promise<void>((resolve) => {
                    this.httpServer!.close(() => resolve());
                });
                this.httpServer = undefined;
            }
            
            this.mcpServer = undefined;
            this.isRunning = false;
            
            this.logger.info('MCP Server stopped');
            vscode.window.showInformationMessage('MCP Task Server stopped');
        } catch (error) {
            this.logger.error('Error stopping MCP Server', { 
                error: error instanceof Error ? error.message : error 
            });
        }
    }

    isServerRunning(): boolean {
        return this.isRunning;
    }



    private async handleMCPRequest(req: any, res: any): Promise<void> {
        try {
            let body = '';
            req.on('data', (chunk: any) => {
                body += chunk.toString();
            });

            req.on('end', async () => {
                try {
                    const request = JSON.parse(body);
                    this.logger.info('Received MCP request', { method: request.method });

                    // Handle MCP protocol requests
                    let response;
                    switch (request.method) {
                        case 'initialize':
                            response = {
                                jsonrpc: '2.0',
                                id: request.id,
                                result: {
                                    protocolVersion: '2024-11-05',
                                    capabilities: {
                                        tools: {}
                                    },
                                    serverInfo: {
                                        name: 'vscode-task-server',
                                        version: '1.0.0'
                                    }
                                }
                            };
                            break;

                        case 'tools/list':
                            const tools = await this.getToolsList();
                            response = {
                                jsonrpc: '2.0',
                                id: request.id,
                                result: { tools }
                            };
                            break;

                        case 'tools/call':
                            const toolResult = await this.executeTool(request.params);
                            response = {
                                jsonrpc: '2.0',
                                id: request.id,
                                result: toolResult
                            };
                            break;

                        default:
                            response = {
                                jsonrpc: '2.0',
                                id: request.id,
                                error: {
                                    code: -32601,
                                    message: `Method ${request.method} not found`
                                }
                            };
                    }

                    res.writeHead(200, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    });
                    res.end(JSON.stringify(response));

                } catch (parseError) {
                    this.logger.error('Error parsing MCP request', { error: parseError });
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        jsonrpc: '2.0',
                        id: null,
                        error: { code: -32700, message: 'Parse error' }
                    }));
                }
            });

        } catch (error) {
            this.logger.error('Error handling MCP request', { error });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                jsonrpc: '2.0',
                id: null,
                error: { code: -32603, message: 'Internal error' }
            }));
        }
    }

    private async getToolsList(): Promise<any[]> {
        return [
            {
                name: 'list_tasks',
                description: 'List all available VSCode tasks in the workspace',
                inputSchema: {
                    type: 'object',
                    properties: {
                        filter: {
                            type: 'string',
                            description: 'Optional filter to match task names or sources'
                        }
                    }
                }
            },
            {
                name: 'execute_task',
                description: 'Execute a specific VSCode task by name',
                inputSchema: {
                    type: 'object',
                    properties: {
                        taskName: {
                            type: 'string',
                            description: 'Name of the task to execute'
                        },
                        source: {
                            type: 'string',
                            description: 'Optional source of the task (e.g., npm, grunt, workspace)'
                        }
                    },
                    required: ['taskName']
                }
            },
            {
                name: 'get_running_tasks',
                description: 'Get a list of currently running VSCode tasks',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'terminate_task',
                description: 'Terminate a running VSCode task by name',
                inputSchema: {
                    type: 'object',
                    properties: {
                        taskName: {
                            type: 'string',
                            description: 'Name of the task to terminate'
                        }
                    },
                    required: ['taskName']
                }
            },
            {
                name: 'get_task_details',
                description: 'Get detailed information about a specific VSCode task',
                inputSchema: {
                    type: 'object',
                    properties: {
                        taskName: {
                            type: 'string',
                            description: 'Name of the task to get details for'
                        },
                        source: {
                            type: 'string',
                            description: 'Optional source of the task'
                        }
                    },
                    required: ['taskName']
                }
            }
        ];
    }

    private async executeTool(params: any): Promise<any> {
        const { name, arguments: args } = params;

        try {
            switch (name) {
                case 'list_tasks':
                    return await this.executeListTasks(args);
                case 'execute_task':
                    return await this.executeTask(args);
                case 'get_running_tasks':
                    return await this.getRunningTasks();
                case 'terminate_task':
                    return await this.terminateTask(args);
                case 'get_task_details':
                    return await this.getTaskDetails(args);
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error executing tool '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`
                }],
                isError: true
            };
        }
    }

    private async executeListTasks(args: any): Promise<any> {
        const tasks = await this.taskProvider.getAllTasks();
        let filteredTasks = tasks;

        if (args.filter) {
            const filterLower = args.filter.toLowerCase();
            filteredTasks = tasks.filter(task => 
                task.name.toLowerCase().includes(filterLower) ||
                task.source.toLowerCase().includes(filterLower) ||
                (task.group && task.group.toLowerCase().includes(filterLower))
            );
        }

        const taskList = filteredTasks.map(task => {
            const executionInfo = task.execution ? 
                `\n  Execution: ${task.execution.type} - ${task.execution.command || 'custom'}` : '';
            const groupInfo = task.group !== 'none' ? `\n  Group: ${task.group}` : '';
            const scopeInfo = `\n  Scope: ${task.scope}`;
            const backgroundInfo = task.isBackground ? '\n  Background: true' : '';
            
            return `• ${task.name} (${task.source})${executionInfo}${groupInfo}${scopeInfo}${backgroundInfo}`;
        }).join('\n');

        const summary = `Found ${filteredTasks.length} tasks${args.filter ? ` matching filter '${args.filter}'` : ''}:\n\n${taskList}`;

        return {
            content: [{
                type: 'text',
                text: summary
            }]
        };
    }

    private async executeTask(args: any): Promise<any> {
        const result = await this.taskProvider.executeTask(args.taskName, args.source);
        
        const statusText = result.success ? 'SUCCESS' : 'FAILED';
        const exitCodeText = result.exitCode !== undefined ? ` (exit code: ${result.exitCode})` : '';
        const durationText = `Duration: ${result.duration}ms`;
        const outputText = result.output ? `\nOutput:\n${result.output}` : '';
        const errorText = result.error ? `\nError:\n${result.error}` : '';

        const responseText = `Task '${result.taskName}' execution ${statusText}${exitCodeText}\n${durationText}${outputText}${errorText}`;

        return {
            content: [{
                type: 'text',
                text: responseText
            }],
            isError: !result.success
        };
    }

    private async getRunningTasks(): Promise<any> {
        const runningTasks = await this.taskProvider.getRunningTasks();
        
        if (runningTasks.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: 'No tasks are currently running.'
                }]
            };
        }

        const taskList = runningTasks.map(task => {
            const executionInfo = task.execution ? 
                ` - ${task.execution.type}: ${task.execution.command || 'custom'}` : '';
            return `• ${task.name} (${task.source})${executionInfo}`;
        }).join('\n');

        return {
            content: [{
                type: 'text',
                text: `Currently running tasks (${runningTasks.length}):\n\n${taskList}`
            }]
        };
    }

    private async terminateTask(args: any): Promise<any> {
        const success = await this.taskProvider.terminateTask(args.taskName);
        
        const responseText = success 
            ? `Task '${args.taskName}' has been terminated successfully.`
            : `Failed to terminate task '${args.taskName}'. Task may not be running or termination failed.`;

        return {
            content: [{
                type: 'text',
                text: responseText
            }],
            isError: !success
        };
    }

    private async getTaskDetails(args: any): Promise<any> {
        const tasks = await this.taskProvider.getAllTasks();
        let targetTask = tasks.find(task => task.name === args.taskName);
        
        if (!targetTask && args.source) {
            targetTask = tasks.find(task => task.name === args.taskName && task.source === args.source);
        }

        if (!targetTask) {
            return {
                content: [{
                    type: 'text',
                    text: `Task '${args.taskName}' not found.`
                }],
                isError: true
            };
        }

        const details = [
            `Task Details for '${targetTask.name}':`,
            `Source: ${targetTask.source}`,
            `Group: ${targetTask.group || 'none'}`,
            `Scope: ${targetTask.scope}`,
            `Background: ${targetTask.isBackground || false}`
        ];

        if (targetTask.execution) {
            details.push(`Execution Type: ${targetTask.execution.type}`);
            if (targetTask.execution.command) {
                details.push(`Command: ${targetTask.execution.command}`);
            }
            if (targetTask.execution.args && targetTask.execution.args.length > 0) {
                details.push(`Arguments: ${targetTask.execution.args.join(' ')}`);
            }
        }

        if (targetTask.problemMatchers && targetTask.problemMatchers.length > 0) {
            details.push(`Problem Matchers: ${targetTask.problemMatchers.join(', ')}`);
        }

        details.push(`Definition: ${JSON.stringify(targetTask.definition, null, 2)}`);

        return {
            content: [{
                type: 'text',
                text: details.join('\n')
            }]
        };
    }

    getServerInfo(): any {
        return {
            running: this.isRunning,
            transport: 'streamable-http',
            port: this.config.port,
            serverName: 'vscode-task-server',
            version: '1.0.0'
        };
    }
}