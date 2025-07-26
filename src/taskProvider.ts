import * as vscode from 'vscode';
import { TaskInfo, TaskExecutionResult } from './types';
import { Logger } from './logger';

export class TaskProvider {
    private logger: Logger;
    private taskExecutions: Map<string, vscode.TaskExecution> = new Map();
    private executionResults: Map<string, TaskExecutionResult> = new Map();

    constructor() {
        this.logger = Logger.getInstance();
        this.setupTaskEventListeners();
    }

    private setupTaskEventListeners(): void {
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
            
            const result: TaskExecutionResult = {
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

    private getTaskId(task: vscode.Task): string {
        return `${task.source}-${task.name}-${task.scope}`;
    }

    async getAllTasks(): Promise<TaskInfo[]> {
        try {
            this.logger.debug('Fetching all available tasks');
            const tasks = await vscode.tasks.fetchTasks();
            
            const taskInfos: TaskInfo[] = tasks.map(task => ({
                name: task.name,
                source: task.source,
                group: (task.group as any)?.kind || 'none',
                scope: this.getScopeString(task.scope || vscode.TaskScope.Workspace),
                definition: task.definition,
                execution: this.getExecutionInfo(task),
                isBackground: task.isBackground,
                problemMatchers: task.problemMatchers
            }));

            this.logger.info(`Found ${taskInfos.length} tasks`);
            return taskInfos;
        } catch (error) {
            this.logger.error('Failed to fetch tasks', { error: error instanceof Error ? error.message : error });
            throw new Error(`Failed to fetch tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private getScopeString(scope: vscode.TaskScope | vscode.WorkspaceFolder): string {
        if (scope === vscode.TaskScope.Global) {
            return 'global';
        } else if (scope === vscode.TaskScope.Workspace) {
            return 'workspace';
        } else if (typeof scope === 'object' && 'name' in scope) {
            return `folder:${scope.name}`;
        }
        return 'unknown';
    }

    private getExecutionInfo(task: vscode.Task): TaskInfo['execution'] {
        if (task.execution instanceof vscode.ShellExecution) {
            const command = task.execution.commandLine || 
                (typeof task.execution.command === 'string' ? task.execution.command : task.execution.command?.value || '');
            const args = task.execution.args?.map(arg => 
                typeof arg === 'string' ? arg : arg.value
            ) || [];
            return {
                type: 'shell',
                command,
                args
            };
        } else if (task.execution instanceof vscode.ProcessExecution) {
            const args = task.execution.args?.map(arg => 
                typeof arg === 'string' ? arg : String(arg)
            ) || [];
            return {
                type: 'process',
                command: task.execution.process,
                args
            };
        } else if (task.execution) {
            return {
                type: 'custom'
            };
        }
        return undefined;
    }

    async executeTask(taskName: string, source?: string): Promise<TaskExecutionResult> {
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
                    } else {
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

        } catch (error) {
            this.logger.error(`Failed to execute task: ${taskName}`, { 
                error: error instanceof Error ? error.message : error 
            });
            throw new Error(`Failed to execute task '${taskName}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getRunningTasks(): Promise<TaskInfo[]> {
        const runningTasks: TaskInfo[] = [];
        
        for (const execution of vscode.tasks.taskExecutions) {
            const taskInfo: TaskInfo = {
                name: execution.task.name,
                source: execution.task.source,
                group: (execution.task.group as any)?.kind || 'none',
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

    async terminateTask(taskName: string): Promise<boolean> {
        try {
            const execution = Array.from(this.taskExecutions.values())
                .find(exec => exec.task.name === taskName);
            
            if (!execution) {
                throw new Error(`No running task found with name: ${taskName}`);
            }

            execution.terminate();
            this.logger.info(`Terminated task: ${taskName}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to terminate task: ${taskName}`, { 
                error: error instanceof Error ? error.message : error 
            });
            return false;
        }
    }
}
