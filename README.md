# VSCode MCP Task Extension

A VSCode extension that provides an embedded Model Context Protocol (MCP) server, enabling AI agents to discover and execute VSCode tasks through standardized MCP tools.

## Features

- **Embedded MCP Server**: Runs within the VSCode extension process
- **Task Discovery**: AI agents can discover all available VSCode tasks
- **Task Execution**: Execute build, test, and custom tasks via MCP tools
- **Real-time Monitoring**: Track running tasks and get execution results
- **Comprehensive Logging**: Detailed logs for debugging MCP interactions
- **Status Feedback**: Visual indicators and notifications for task operations

## Installation & Setup

1. Install dependencies: `npm install`
2. Compile TypeScript: `npx tsc --build`
3. Press `F5` to run the extension in a new Extension Development Host window
4. The MCP server will auto-start on port 3000 (configurable)

## MCP Tools Available

The extension exposes these MCP tools for AI agents:

- **`list_tasks`**: Discover all available VSCode tasks in workspace
- **`execute_task`**: Run specific tasks by name
- **`get_running_tasks`**: Monitor currently executing tasks
- **`terminate_task`**: Stop running tasks
- **`get_task_details`**: Get detailed information about specific tasks

## Commands

- `MCP Task Server: Start` - Start the embedded MCP server
- `MCP Task Server: Stop` - Stop the MCP server
- `MCP Task Server: Restart` - Restart the server
- `MCP Task Server: Show Logs` - View detailed logs

## Configuration

The extension can be configured through VSCode settings:

```json
{
    "mcpTaskServer.port": 3000,
    "mcpTaskServer.enableLogging": true,
    "mcpTaskServer.autoStart": true
}

## AI Agent Integration

AI agents can connect to the MCP server using stdio transport. The extension provides a standard MCP server that:

1. Uses the official MCP TypeScript SDK
2. Communicates via stdio protocol (standard input/output)
3. Exposes VSCode tasks as MCP tools
4. Provides real-time task execution feedback

## Architecture

- **Extension Process**: Hosts the MCP server within VSCode
- **MCP Server**: Uses official `@modelcontextprotocol/sdk` with stdio transport
- **Task Provider**: Interfaces with VSCode's task system
- **Logger**: Centralized logging with output channel integration
- **Status Bar**: Shows server status and MCP connection state

