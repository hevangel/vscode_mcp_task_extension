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
exports.TaskProvider = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("./logger");
class TaskProvider {
    constructor() {
        this.taskExecutions = new Map();
        this.executionResults = new Map();
        this.logger = logger_1.Logger.getInstance();
        this.setupTaskEventListeners();
    }
    setupTaskEventListeners() {
        // Listen for task start events
        vscode.tasks.onDidStartTask((e) => {
            const taskId = this.getTaskId(e.execution.task);
            this.taskExecutions.set(taskId, e.execution);
            this.logger.info(`Task started: ${e.execution.task.name}`, { taskId });
        });
        // Listen for task end events
        vscode.tasks.onDidEndTask((e) => {
            const taskId = this.getTaskId(e.execution.task);
            const startTime = Date.now(); // In real implementation, track start time
            const result = {
                taskName: e.execution.task.name,
                success: true, // Will be updated based on actual result
                duration: Date.now() - startTime
            };
            this.executionResults.set(taskId, result);
            this.taskExecutions.delete(taskId);
            this.logger.info(`Task completed: ${e.execution.task.name}`, { taskId, result });
        });
        // Listen for task process events
        vscode.tasks.onDidStartTaskProcess((e) => {
            this.logger.debug(`Task process started: ${e.execution.task.name}`, {
                processId: e.processId
            });
        });
        vscode.tasks.onDidEndTaskProcess((e) => {
            const taskId = this.getTaskId(e.execution.task);
            const result = this.executionResults.get(taskId);
            if (result) {
                result.exitCode = e.exitCode;
                result.success = e.exitCode === 0;
                this.executionResults.set(taskId, result);
            }
            this.logger.debug(`Task process ended: ${e.execution.task.name}`, {
                exitCode: e.exitCode
            });
        });
    }
    getTaskId(task) {
        return `${task.source}-${task.name}-${task.scope}`;
    }
    async getAllTasks() {
        try {
            this.logger.debug('Fetching all available tasks');
            const tasks = await vscode.tasks.fetchTasks();
            const taskInfos = tasks.map(task => ({
                name: task.name,
                source: task.source,
                group: task.group?.kind || 'none',
                scope: this.getScopeString(task.scope || vscode.TaskScope.Workspace),
                definition: task.definition,
                execution: this.getExecutionInfo(task),
                isBackground: task.isBackground,
                problemMatchers: task.problemMatchers
            }));
            this.logger.info(`Found ${taskInfos.length} tasks`);
            return taskInfos;
        }
        catch (error) {
            this.logger.error('Failed to fetch tasks', { error: error instanceof Error ? error.message : error });
            throw new Error(`Failed to fetch tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getScopeString(scope) {
        if (scope === vscode.TaskScope.Global) {
            return 'global';
        }
        else if (scope === vscode.TaskScope.Workspace) {
            return 'workspace';
        }
        else if (typeof scope === 'object' && 'name' in scope) {
            return `folder:${scope.name}`;
        }
        return 'unknown';
    }
    getExecutionInfo(task) {
        if (task.execution instanceof vscode.ShellExecution) {
            const command = task.execution.commandLine ||
                (typeof task.execution.command === 'string' ? task.execution.command : task.execution.command?.value || '');
            const args = task.execution.args?.map(arg => typeof arg === 'string' ? arg : arg.value) || [];
            return {
                type: 'shell',
                command,
                args
            };
        }
        else if (task.execution instanceof vscode.ProcessExecution) {
            const args = task.execution.args?.map(arg => typeof arg === 'string' ? arg : String(arg)) || [];
            return {
                type: 'process',
                command: task.execution.process,
                args
            };
        }
        else if (task.execution) {
            return {
                type: 'custom'
            };
        }
        return undefined;
    }
    async executeTask(taskName, source) {
        try {
            this.logger.info(`Attempting to execute task: ${taskName}`, { source });
            const tasks = await vscode.tasks.fetchTasks();
            let targetTask = tasks.find(task => task.name === taskName);
            if (!targetTask && source) {
                targetTask = tasks.find(task => task.name === taskName && task.source === source);
            }
            if (!targetTask) {
                const availableTasks = tasks.map(t => `${t.source}:${t.name}`).join(', ');
                throw new Error(`Task '${taskName}' not found. Available tasks: ${availableTasks}`);
            }
            const startTime = Date.now();
            const execution = await vscode.tasks.executeTask(targetTask);
            const taskId = this.getTaskId(targetTask);
            // Return a promise that resolves when the task completes
            return new Promise((resolve, reject) => {
                const checkCompletion = () => {
                    const result = this.executionResults.get(taskId);
                    if (result) {
                        this.executionResults.delete(taskId);
                        resolve(result);
                        return;
                    }
                    // Check if task is still running
                    if (this.taskExecutions.has(taskId)) {
                        setTimeout(checkCompletion, 100);
                    }
                    else {
                        // Task completed but no result recorded (shouldn't happen)
                        resolve({
                            taskName,
                            success: true,
                            duration: Date.now() - startTime
                        });
                    }
                };
                // Start checking after a brief delay
                setTimeout(checkCompletion, 100);
                // Set a timeout to prevent hanging indefinitely
                setTimeout(() => {
                    if (this.taskExecutions.has(taskId)) {
                        reject(new Error(`Task '${taskName}' timed out after 5 minutes`));
                    }
                }, 5 * 60 * 1000); // 5 minutes timeout
            });
        }
        catch (error) {
            this.logger.error(`Failed to execute task: ${taskName}`, {
                error: error instanceof Error ? error.message : error
            });
            throw new Error(`Failed to execute task '${taskName}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getRunningTasks() {
        const runningTasks = [];
        for (const execution of vscode.tasks.taskExecutions) {
            const taskInfo = {
                name: execution.task.name,
                source: execution.task.source,
                group: execution.task.group?.kind || 'none',
                scope: this.getScopeString(execution.task.scope || vscode.TaskScope.Workspace),
                definition: execution.task.definition,
                execution: this.getExecutionInfo(execution.task),
                isBackground: execution.task.isBackground
            };
            runningTasks.push(taskInfo);
        }
        this.logger.debug(`Found ${runningTasks.length} running tasks`);
        return runningTasks;
    }
    async terminateTask(taskName) {
        try {
            const execution = Array.from(this.taskExecutions.values())
                .find(exec => exec.task.name === taskName);
            if (!execution) {
                throw new Error(`No running task found with name: ${taskName}`);
            }
            execution.terminate();
            this.logger.info(`Terminated task: ${taskName}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to terminate task: ${taskName}`, {
                error: error instanceof Error ? error.message : error
            });
            return false;
        }
    }
}
exports.TaskProvider = TaskProvider;
//# sourceMappingURL=taskProvider.js.map