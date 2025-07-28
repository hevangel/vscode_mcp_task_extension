# VSCode MCP Task Extension

## Overview

This is a fully functional VSCode extension that provides an embedded Model Context Protocol (MCP) server, enabling AI agents to discover and execute VSCode tasks through standardized MCP tools. The extension uses the official MCP TypeScript SDK with stdio transport to communicate with AI agents via the standard MCP protocol. The extension has been successfully built and all TypeScript compilation errors have been resolved.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **VSCode Extension**: Built using TypeScript and the VSCode Extension API
- **Extension Host Process**: The MCP server runs within the VSCode extension process, not as a separate service
- **MCP Server**: Uses HTTP-based streamable transport for reliable MCP communication

### Backend Architecture
- **Embedded MCP Server**: Uses official MCP TypeScript SDK, runs inside the VSCode extension
- **Task Provider**: Interfaces with VSCode's built-in task system to discover and execute tasks
- **MCP Tools**: Implements standardized MCP tools for task operations using proper SDK
- **Logger**: Centralized logging system with output channel integration

### Key Design Decisions
1. **Embedded Server Approach**: The MCP server runs within the extension process using official MCP SDK
2. **HTTP Communication**: Uses streamable-http transport for reliable communication with AI agents
3. **TypeScript**: Chosen for type safety and better IDE support in the VSCode ecosystem
4. **Event-Driven Architecture**: Leverages VSCode's event system for monitoring task lifecycle

## Key Components

### 1. Extension Entry Point (`src/extension.ts`)
- Manages extension activation and deactivation
- Registers VSCode commands for server control
- Handles configuration changes and auto-start functionality
- Manages the MCP server lifecycle

### 2. MCP Server (`src/mcpServer.ts`)
- Implements the core MCP protocol server
- Manages WebSocket connections with multiple clients
- Handles MCP requests and routes them to appropriate tools
- Provides error handling and client management

### 3. Task Provider (`src/taskProvider.ts`)
- Interfaces with VSCode's task system
- Discovers available tasks across the workspace
- Executes tasks and monitors their status
- Tracks running tasks and execution results

### 4. MCP Tools (`src/mcpTools.ts`)
- Implements standardized MCP tools:
  - `list_tasks`: Discover available VSCode tasks
  - `execute_task`: Run specific tasks
  - `get_running_tasks`: Monitor active tasks
- Handles tool parameter validation and execution

### 5. Logger (`src/logger.ts`)
- Centralized logging with multiple severity levels
- Integrates with VSCode's output channel system
- Maintains in-memory log history with rotation
- Supports structured logging with context

### 6. Types (`src/types.ts`)
- Comprehensive TypeScript type definitions
- MCP protocol message types
- Task-related data structures
- Configuration interfaces

## Data Flow

1. **Extension Activation**: VSCode loads the extension and optionally auto-starts the MCP server
2. **Client Connection**: AI agents connect to the MCP server via HTTP on the configured port
3. **Tool Discovery**: Clients can request available MCP tools from the server
4. **Task Operations**: Clients invoke tools to list, execute, or monitor VSCode tasks
5. **Real-time Updates**: The server provides real-time feedback on task execution status
6. **Event Monitoring**: The task provider listens to VSCode task events and provides updates

## External Dependencies

### Production Dependencies
- `@modelcontextprotocol/sdk`: Official MCP TypeScript SDK for server implementation
- `zod`: Schema validation library used by MCP SDK
- `@types/vscode`: VSCode extension API type definitions

### Development Dependencies
- `typescript`: TypeScript compiler for type-safe development
- `@typescript-eslint/parser` & `@typescript-eslint/eslint-plugin`: ESLint integration for TypeScript
- `eslint`: Code linting and style enforcement

### VSCode Integration
- **Task API**: Core integration with VSCode's task system
- **Commands API**: Registration of extension commands
- **Configuration API**: Settings management and change detection
- **Output Channel API**: Logging integration

## Deployment Strategy

### Development Environment
1. **Local Development**: Use `F5` to launch extension in Extension Development Host
2. **TypeScript Compilation**: Automatic compilation to `out/` directory
3. **Hot Reload**: Watch mode for continuous development
4. **Debug Support**: Full debugging support through VSCode's extension host

### Extension Packaging
- Standard VSCode extension structure with `package.json` manifest
- TypeScript source in `src/` compiled to `out/`
- ESLint configuration for code quality
- Launch configuration for development testing

### Configuration Management
- Extension settings under `mcpTaskServer` namespace:
  - `enableLogging`: Toggle detailed logging
  - `autoStart`: Automatically start server on activation

### Security Considerations
- MCP server uses HTTP-based streamable transport
- Network access required for MCP client connections
- Task execution has same permissions as VSCode process

### Runtime Requirements
- VSCode 1.102.0 or higher
- Node.js runtime (provided by VSCode)
- MCP client supporting streamable-http transport
- Workspace with defined tasks for full functionality

## Recent Changes

### July 28, 2025
✓ Added MCP server registration with VSCode extension API
✓ Implemented registerMCPServerWithVSCode function using vscode.lm.registerMcpServerDefinitionProvider
✓ Added dynamic server registration that activates when MCP server starts
✓ Fixed VSIX build task to use correct vsce package flags
✓ Added refreshMCPServerRegistration function for state updates
✓ Extension now registers itself with VSCode's language model for agent mode integration

### July 27, 2025
✓ Implemented streamable-http transport for MCP server as requested
✓ Created HTTP-based MCP server listening on configurable port (default: 3000)
✓ Added proper MCP protocol handlers for initialize, tools/list, and tools/call methods
✓ Implemented all 5 VSCode task tools (list_tasks, execute_task, get_running_tasks, terminate_task, get_task_details)
✓ Updated status bar to show server port and transport type
✓ Successfully compiled extension with streamable-http MCP implementation
✓ Extension now provides HTTP-based MCP server for reliable AI agent integration