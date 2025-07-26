import * as vscode from 'vscode';

// MCP Protocol Types
export interface MCPRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: any;
}

export interface MCPResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: any;
    error?: MCPError;
}

export interface MCPError {
    code: number;
    message: string;
    data?: any;
}

export interface MCPNotification {
    jsonrpc: '2.0';
    method: string;
    params?: any;
}

// MCP Tool Types
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface MCPToolCall {
    name: string;
    arguments: Record<string, any>;
}

export interface MCPToolResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}

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
