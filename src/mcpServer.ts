import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MCPServerConfig } from './types';
import { TaskProvider } from './taskProvider';
import { Logger } from './logger';

export class MCPServer {
    private mcpServer?: McpServer;
    private transport?: StdioServerTransport;
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

            // Register all VSCode task tools
            await this.registerTools();

            // Create stdio transport for MCP communication
            this.transport = new StdioServerTransport();
            
            // Connect the server to the transport
            await this.mcpServer.connect(this.transport);
            
            this.isRunning = true;
            this.logger.info('MCP Server started with stdio transport');
            vscode.window.showInformationMessage('MCP Task Server started');
            
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
            if (this.transport) {
                await this.transport.close();
                this.transport = undefined;
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

    private async registerTools(): Promise<void> {
        if (!this.mcpServer) {
            return;
        }

        // Register list_tasks tool
        this.mcpServer.registerTool(
            'list_tasks',
            {
                title: 'List VSCode Tasks',
                description: 'List all available VSCode tasks in the workspace',
                inputSchema: {
                    filter: z.string().optional().describe('Optional filter to match task names or sources')
                }
            },
            async ({ filter }) => {
                try {
                    const tasks = await this.taskProvider.getAllTasks();
                    let filteredTasks = tasks;

                    if (filter) {
                        const filterLower = filter.toLowerCase();
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

                    const summary = `Found ${filteredTasks.length} tasks${filter ? ` matching filter '${filter}'` : ''}:\n\n${taskList}`;

                    return {
                        content: [{
                            type: 'text',
                            text: summary
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Register execute_task tool
        this.mcpServer.registerTool(
            'execute_task',
            {
                title: 'Execute VSCode Task',
                description: 'Execute a specific VSCode task by name',
                inputSchema: {
                    taskName: z.string().describe('Name of the task to execute'),
                    source: z.string().optional().describe('Optional source of the task (e.g., npm, grunt, workspace)')
                }
            },
            async ({ taskName, source }) => {
                try {
                    const result = await this.taskProvider.executeTask(taskName, source);
                    
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
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Error executing task '${taskName}': ${error instanceof Error ? error.message : 'Unknown error'}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Register get_running_tasks tool
        this.mcpServer.registerTool(
            'get_running_tasks',
            {
                title: 'Get Running Tasks',
                description: 'Get a list of currently running VSCode tasks',
                inputSchema: {}
            },
            async () => {
                try {
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
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Error getting running tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Register terminate_task tool
        this.mcpServer.registerTool(
            'terminate_task',
            {
                title: 'Terminate Task',
                description: 'Terminate a running VSCode task by name',
                inputSchema: {
                    taskName: z.string().describe('Name of the task to terminate')
                }
            },
            async ({ taskName }) => {
                try {
                    const success = await this.taskProvider.terminateTask(taskName);
                    
                    const responseText = success 
                        ? `Task '${taskName}' has been terminated successfully.`
                        : `Failed to terminate task '${taskName}'. Task may not be running or termination failed.`;

                    return {
                        content: [{
                            type: 'text',
                            text: responseText
                        }],
                        isError: !success
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Error terminating task '${taskName}': ${error instanceof Error ? error.message : 'Unknown error'}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Register get_task_details tool
        this.mcpServer.registerTool(
            'get_task_details',
            {
                title: 'Get Task Details',
                description: 'Get detailed information about a specific VSCode task',
                inputSchema: {
                    taskName: z.string().describe('Name of the task to get details for'),
                    source: z.string().optional().describe('Optional source of the task')
                }
            },
            async ({ taskName, source }) => {
                try {
                    const tasks = await this.taskProvider.getAllTasks();
                    let targetTask = tasks.find(task => task.name === taskName);
                    
                    if (!targetTask && source) {
                        targetTask = tasks.find(task => task.name === taskName && task.source === source);
                    }

                    if (!targetTask) {
                        return {
                            content: [{
                                type: 'text',
                                text: `Task '${taskName}' not found.`
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
                } catch (error) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Error getting task details for '${taskName}': ${error instanceof Error ? error.message : 'Unknown error'}`
                        }],
                        isError: true
                    };
                }
            }
        );

        this.logger.info('Registered all MCP tools for VSCode tasks');
    }

    getServerInfo(): any {
        return {
            running: this.isRunning,
            transport: 'stdio',
            serverName: 'vscode-task-server',
            version: '1.0.0'
        };
    }
}