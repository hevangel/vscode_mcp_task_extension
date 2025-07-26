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
exports.Logger = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.outputChannel = vscode.window.createOutputChannel('MCP Task Server');
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    log(level, message, context) {
        const entry = {
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
        const levelName = types_1.LogLevel[level];
        const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
        const logMessage = `[${timestamp}] [${levelName}] ${message}${contextStr}`;
        this.outputChannel.appendLine(logMessage);
        // Also log to console for debugging
        switch (level) {
            case types_1.LogLevel.DEBUG:
                console.debug(logMessage);
                break;
            case types_1.LogLevel.INFO:
                console.info(logMessage);
                break;
            case types_1.LogLevel.WARN:
                console.warn(logMessage);
                break;
            case types_1.LogLevel.ERROR:
                console.error(logMessage);
                break;
        }
    }
    debug(message, context) {
        this.log(types_1.LogLevel.DEBUG, message, context);
    }
    info(message, context) {
        this.log(types_1.LogLevel.INFO, message, context);
    }
    warn(message, context) {
        this.log(types_1.LogLevel.WARN, message, context);
    }
    error(message, context) {
        this.log(types_1.LogLevel.ERROR, message, context);
    }
    show() {
        this.outputChannel.show();
    }
    getLogs() {
        return [...this.logs];
    }
    clear() {
        this.logs = [];
        this.outputChannel.clear();
    }
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map