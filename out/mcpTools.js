"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPTools = void 0;
const logger_1 = require("./logger");
class MCPTools {
    constructor(taskProvider) {
        this.taskProvider = taskProvider;
        this.logger = logger_1.Logger.getInstance();
    }
    getAvailableTools() {
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
                description: 'Get a list of currently running tasks',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'terminate_task',
                description: 'Terminate a running task by name',
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
                description: 'Get detailed information about a specific task',
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
    async executeTool(toolCall) {
        this.logger.info(`Executing MCP tool: ${toolCall.name}`, { arguments: toolCall.arguments });
        try {
            switch (toolCall.name) {
                case 'list_tasks':
                    return await this.listTasks(toolCall.arguments);
                case 'execute_task':
                    return await this.executeTask(toolCall.arguments);
                case 'get_running_tasks':
                    return await this.getRunningTasks();
                case 'terminate_task':
                    return await this.terminateTask(toolCall.arguments);
                case 'get_task_details':
                    return await this.getTaskDetails(toolCall.arguments);
                default:
                    throw new Error(`Unknown tool: ${toolCall.name}`);
            }
        }
        catch (error) {
            this.logger.error(`Tool execution failed: ${toolCall.name}`, {
                error: error instanceof Error ? error.message : error,
                arguments: toolCall.arguments
            });
            return {
                content: [{
                        type: 'text',
                        text: `Error executing tool '${toolCall.name}': ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                isError: true
            };
        }
    }
    async listTasks(args) {
        const tasks = await this.taskProvider.getAllTasks();
        let filteredTasks = tasks;
        if (args.filter) {
            const filter = args.filter.toLowerCase();
            filteredTasks = tasks.filter(task => task.name.toLowerCase().includes(filter) ||
                task.source.toLowerCase().includes(filter) ||
                (task.group && task.group.toLowerCase().includes(filter)));
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
    async executeTask(args) {
        if (!args.taskName) {
            throw new Error('taskName is required');
        }
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
    async getRunningTasks() {
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
    async terminateTask(args) {
        if (!args.taskName) {
            throw new Error('taskName is required');
        }
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
    async getTaskDetails(args) {
        if (!args.taskName) {
            throw new Error('taskName is required');
        }
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
}
exports.MCPTools = MCPTools;
//# sourceMappingURL=mcpTools.js.map