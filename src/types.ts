import * as vscode from 'vscode';

// Task-related Types
export interface TaskInfo {
    name: string;
    source: string;
    group?: string;
    scope: string;
    definition: vscode.TaskDefinition;
    execution?: {
        type: 'shell' | 'process' | 'custom';
        command?: string;
        args?: string[];
    };
    isBackground?: boolean;
    problemMatchers?: string[];
}

export interface TaskExecutionResult {
    taskName: string;
    exitCode?: number;
    success: boolean;
    output?: string;
    error?: string;
    duration: number;
}

// Server Configuration
export interface MCPServerConfig {
    port: number;
    enableLogging: boolean;
    autoStart: boolean;
}

// Logging Types
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    context?: any;
}
