# Jenkins Server MCP

A Model Context Protocol (MCP) server that provides tools for interacting with Jenkins CI/CD servers. This server enables AI assistants to check build statuses, trigger builds, and retrieve build logs through a standardized interface.

## Installation

1. Clone this repository:
```bash
git clone https://github.com/prakashkumar-devarajan/jenkins-server-mcp.git
cd jenkins-server-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

The server requires the following environment variables:

- `JENKINS_URL`: The URL of your Jenkins server
- `JENKINS_USER`: Jenkins username for authentication
- `JENKINS_TOKEN`: Jenkins API token for authentication

Configure these in your MCP settings file:

### For VS Code mcp.json file

Windows: `.vscode/mcp.json`

```json
{
    "servers": {
      "zerto-jenkins-server-mcp": {
        "command": "node",
        "args": [
          "C:\\Users\\devpraka\\mcp-servers\\jenkins-server-mcp\\build\\index.js"
        ],
        "env": {
		      "NODE_EXTRA_CA_CERTS": "<Jenkins ROOT CA>.crt",
          "JENKINS_URL": "https://your-jenkins-server.com",
          "JENKINS_USER": "your-username",
          "JENKINS_TOKEN": "your-api-token"
        }
      }
    }
}
```

## Tools and Usage

### 1. Get Build Status

Get the status of a Jenkins build:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "get_build_status", {
  jobPath: "view/xxx_debug",
  buildNumber: "lastBuild"  // Optional, defaults to lastBuild
});
```

Input Schema:
```json
{
  "jobPath": "string",  // Path to Jenkins job
  "buildNumber": "string"  // Optional, build number or "lastBuild"
}
```

### 2. Get Build Log

Retrieve the console output of a Jenkins build:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "get_build_log", {
  jobPath: "view/xxx_debug",
  buildNumber: "lastBuild"
});
```

Input Schema:
```json
{
  "jobPath": "string",  // Path to Jenkins job
  "buildNumber": "string"  // Build number or "lastBuild"
}
```

### 3. Build Job

Trigger a Jenkins job, automatically choosing between build and buildWithParameters:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "build_job", {
  jobPath: "job/ZVML/job/zvml_builds/job/ZVML_Services_Private",
  parameters: {
    BRANCH: "main"
  }
});
```

Input Schema:
```json
{
  "jobPath": "string",  // Path to Jenkins job
  "parameters": {  // Optional
    // Build parameters as key-value pairs
  }
}
```

### 4. Search Jobs

Search for Jenkins jobs by name:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "search_jobs", {
  query: "zvml"
});
```

Input Schema:
```json
{
  "query": "string"  // Search keyword for job names
}
```

### 5. Get All Nodes

Get all Jenkins nodes (agents) and their status:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "get_all_nodes", {});
```

Returns information about all nodes including:
- Display name
- Online/offline status
- Idle status
- Temporarily offline status
- Offline cause reason
- Number of executors

### 6. Get Running Builds

Get all currently running builds across all Jenkins jobs:

```typescript
// Example usage
const result = await mcpClient.useTool("jenkins-server", "get_running_builds", {});
```

Returns:
- Total count of running builds
- List of builds with:
  - Full display name
  - Build URL
  - Timestamp
  - Estimated duration
  - Node name where build is executing