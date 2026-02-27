# Jenkins Server MCP

A Model Context Protocol (MCP) server that provides tools for interacting with Zerto Jenkins server. This server enables AI assistants to check build statuses, trigger builds, and retrieve build logs through a standardized interface.

## Installation

1. Clone this repository:
```bash
git clone https://github.com/prakashkumar-devarajan/zerto-jenkins-mcp-server.git
cd zerto-jenkins-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Download the Zerto-Root-CA.crt Certificate

1. **Via Browser:**
   - Navigate to your Zerto Jenkins server URL in your browser
   - Click on the padlock icon in the address bar
   - Click "Certificate" or "Connection is secure" > "Certificate is valid"
   - Go to the "Details" tab and select "Zerto Root CA"
   - Click "Export" and save as `Zerto-Root-CA.crt`

2. **Place the certificate:**
   - Save the `Zerto-Root-CA.crt` file in your project directory or a secure location
   - Note the full path to this file for configuration steps below

## Docker Deployment

### Building the Docker Image

```bash
docker build -t jenkins-mcp-server .
```

### Running with Docker (Alternative)

If you prefer not to use docker-compose, you can configure mcp.json to spawn containers on-demand:

```json
{
  "servers": {
    "jenkins-mcp-server": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "JENKINS_URL=https://your-jenkins-server.com",
        "-e", "JENKINS_USER=your-username",
        "-e", "JENKINS_TOKEN=your-api-token",
        "-e", "NODE_EXTRA_CA_CERTS=/app/Zerto-Root-CA.crt",
        "-v", "/path/to/Zerto-Root-CA.crt:/app/Zerto-Root-CA.crt:ro",
        "jenkins-mcp-server:2.0"
      ]
    }
  }
}
```

### Transport Options

The server supports two transport modes:

| Mode | Use Case | Protocol | Configuration |
|------|----------|----------|---------------|
| **stdio** | Local development, VS Code integration | Standard I/O | `docker-compose.yml` |
| **SSE/HTTP** | Remote access, web clients, multiple connections | Server-Sent Events | `docker-compose-http.yml` |

### Option 1: stdio Mode (Docker Compose)

Best for local VS Code integration where the MCP client spawns the server process.

1. Create a `.env` file with your Jenkins credentials:
```bash
JENKINS_USER=your-username@example.com
JENKINS_TOKEN=your-api-token
```

2. Start the container:
```bash
docker-compose up -d
```

3. Configure VS Code mcp.json to use the running container:
```json
{
  "servers": {
    "jenkins-mcp-server": {
      "command": "docker",
      "args": ["exec", "-i", "jenkins-mcp-server", "node", "build/index.js"]
    }
  }
}
```

The container stays running in the background, and VS Code executes the MCP server when needed via `docker exec`.

### Option 2: SSE/HTTP Mode (Docker Compose)

Best for remote access, web-based MCP clients, or when you need multiple concurrent connections. **Users provide their own Jenkins credentials via HTTP Basic Auth.**

1. Start the HTTP server (no `.env` file needed for credentials):
```bash
docker-compose -f docker-compose-http.yml up -d
```

2. The server exposes:
   - **Health check**: `http://localhost:3000/health`
   - **SSE endpoint**: `http://localhost:3000/sse` (requires Basic Auth)
   - **Message endpoint**: `POST http://localhost:3000/message?sessionId=<session>`

3. **Generate your Basic Auth header**:

   The Authorization header is Base64-encoded `username:api-token`. Generate it using one of these methods:

   **PowerShell:**
   ```powershell
   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("your-username@example.com:your-api-token"))
   ```

   **Bash/Linux:**
   ```bash
   echo -n "your-username@example.com:your-api-token" | base64
   ```

   **Node.js:**
   ```javascript
   Buffer.from("your-username@example.com:your-api-token").toString("base64")
   ```

   **Python:**
   ```python
   import base64
   base64.b64encode(b"your-username@example.com:your-api-token").decode()
   ```

4. Configure VS Code mcp.json for SSE with the generated header:
```json
{
  "servers": {
    "jenkins-mcp-server": {
      "type": "sse",
      "url": "http://localhost:3000/sse",
      "headers": {
        "Authorization": "Basic <your-base64-encoded-credentials>"
      }
    }
  }
}
```

**Example** (for user `john@example.com` with token `abc123`):
```json
{
  "servers": {
    "jenkins-mcp-server": {
      "type": "sse",
      "url": "http://localhost:3000/sse",
      "headers": {
        "Authorization": "Basic am9obkBleGFtcGxlLmNvbTphYmMxMjM="
      }
    }
  }
}
```

5. Test with curl:
```bash
curl -u "your-username:your-api-token" http://localhost:3000/sse
```

6. Verify the server is running:
```bash
# Check health (no auth required)
curl http://localhost:3000/health

# View logs
docker-compose -f docker-compose-http.yml logs -f
```

**Note:** You can optionally set `JENKINS_USER` and `JENKINS_TOKEN` in docker-compose as fallback credentials for users who don't provide Basic Auth.

## Configuration

The server requires the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `JENKINS_URL` | Yes | The URL of your Jenkins server |
| `JENKINS_USER` | stdio: Yes, http: No | Jenkins username (http mode uses Basic Auth from client) |
| `JENKINS_TOKEN` | stdio: Yes, http: No | Jenkins API token (http mode uses Basic Auth from client) |
| `SERVER_MODE` | No | Transport mode: `stdio` (default) or `http` |
| `PORT` | No | HTTP server port (default: `3000`, only used when `SERVER_MODE=http`) |

### Running Directly with Node.js (Without Docker)

If you prefer not to use Docker, you can run the server directly with Node.js.

#### stdio Mode (VS Code mcp.json)

```json
{
    "servers": {
      "jenkins-mcp-server": {
        "command": "node",
        "args": [
          "C:\\Users\\devpraka\\mcp-servers\\zerto-jenkins-mcp-server\\build\\index.js"
        ],
        "env": {
          "NODE_EXTRA_CA_CERTS": "C:\\Users\\devpraka\\mcp-servers\\zerto-jenkins-mcp-server\\Zerto-Root-CA.crt",
          "JENKINS_URL": "https://your-jenkins-server.com",
          "JENKINS_USER": "your-username",
          "JENKINS_TOKEN": "your-api-token"
        }
      }
    }
}
```

#### SSE/HTTP Mode

Start the server in HTTP mode:

```bash
# Set environment variables
export JENKINS_URL=https://your-jenkins-server.com
export JENKINS_USER=your-username
export JENKINS_TOKEN=your-api-token
export NODE_EXTRA_CA_CERTS=/path/to/Zerto-Root-CA.crt
export SERVER_MODE=http
export PORT=3000

# Start the server
node build/index.js
```

Then configure VS Code mcp.json:

```json
{
    "servers": {
      "jenkins-mcp-server": {
        "type": "sse",
        "url": "http://localhost:3000/sse"
      }
    }
}
```

**Note:** Using Docker (see above) is recommended for easier dependency management and isolation.

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

Input Schema:
```json
{
  // No input parameters required
}
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

Input Schema:
```json
{
  // No input parameters required
}
```

Returns:
- Total count of running builds
- List of builds with:
  - Full display name
  - Build URL
  - Timestamp
  - Estimated duration
  - Node name where build is executing
