import * as vscode from 'vscode';
import { LogLevel, LogEntry } from './types';

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logs: LogEntry[] = [];
    private maxLogs = 1000;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MCP Task Server');
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private log(level: LogLevel, message: string, context?: any): void {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
            context
        };

        // Add to in-memory logs
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Format and output
        const timestamp = entry.timestamp.toISOString();
        const levelName = LogLevel[level];
        const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
        const logMessage = `[${timestamp}] [${levelName}] ${message}${contextStr}`;

        this.outputChannel.appendLine(logMessage);

        // Also log to console for debugging
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(logMessage);
                break;
            case LogLevel.INFO:
                console.info(logMessage);
                break;
            case LogLevel.WARN:
                console.warn(logMessage);
                break;
            case LogLevel.ERROR:
                console.error(logMessage);
                break;
        }
    }

    debug(message: string, context?: any): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    info(message: string, context?: any): void {
        this.log(LogLevel.INFO, message, context);
    }

    warn(message: string, context?: any): void {
        this.log(LogLevel.WARN, message, context);
    }

    error(message: string, context?: any): void {
        this.log(LogLevel.ERROR, message, context);
    }

    show(): void {
        this.outputChannel.show();
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    clear(): void {
        this.logs = [];
        this.outputChannel.clear();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
