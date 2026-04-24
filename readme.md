# Jenkins Server MCP

A Model Context Protocol (MCP) server that provides tools for interacting with Zerto Jenkins server. This server enables AI assistants to check build statuses, trigger builds, retrieve build logs, and leverage GitHub Copilot to automatically analyze console output — identifying errors, failure reasons, and stack traces — through a standardized interface.

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
| **HTTP** | Remote access, web clients, multiple connections | Streamable HTTP (recommended) | `docker-compose-http.yml` |

### Option 1: stdio Mode (Docker Compose)

Best for local VS Code integration where the MCP client spawns the server process.

1. Create a `.env` file with your Jenkins credentials:
```bash
JENKINS_USER=your-username@example.com
JENKINS_TOKEN=your-api-token
```

2. Start the container:
```bash
docker-compose up -d --build
```

3. Configure VS Code mcp.json to use the running container:
```json
{
  "servers": {
    "jenkins-mcp-server": {
      "command": "docker",
      "args": ["exec", "-i", "jenkins-mcp-server-stdio", "node", "build/index.js"]
    }
  }
}
```

The container stays running in the background, and VS Code executes the MCP server when needed via `docker exec`.

### Option 2: HTTP Mode (Docker Compose)

Best for remote access, web-based MCP clients, or when you need multiple concurrent connections. **Users provide their own Jenkins credentials via HTTP Basic Auth.**

1. Start the HTTP server (no `.env` file needed for credentials):
```bash
docker-compose -f docker-compose-http.yml up -d --build
```

2. The server exposes:
   - **Health check**: `http://localhost:3000/health`
  - **Streamable HTTP endpoint**: `http://localhost:3000/mcp` (requires Basic Auth)
  - **Legacy SSE endpoint** (compatibility): `http://localhost:3000/sse`
  - **Legacy SSE message endpoint** (compatibility): `POST http://localhost:3000/message?sessionId=<session>`

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

4. Configure VS Code mcp.json for Streamable HTTP with the generated header:
```json
{
  "servers": {
    "jenkins-mcp-server": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
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
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Basic am9obkBleGFtcGxlLmNvbTphYmMxMjM="
      }
    }
  }
}
```

5. Test with curl:
```bash
curl -u "your-username:your-api-token" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-05","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0.0"}}}' \
  http://localhost:3000/mcp
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

#### HTTP Mode

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
        "type": "http",
        "url": "http://localhost:3000/mcp"
      }
    }
}
```

To use legacy SSE clients, configure:

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

Get the status of a Jenkins build including whether it's running, the result, duration, and URL.

Input Schema:
```json
{
  "jobPath": "string",      // Required. Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")
  "buildNumber": "string"   // Optional. Build number or "lastBuild" (default: lastBuild)
}
```

Returns: `disabled`, `building`, `result`, `timestamp`, `duration`, `url`

### 2. Get Build Log

Retrieve the console output of a Jenkins build with pagination support. Returns up to 500 lines by default; use `startLine` to paginate through large logs.

Input Schema:
```json
{
  "jobPath": "string",      // Required. Path to the Jenkins job
  "buildNumber": "string",  // Required. Build number or "lastBuild"
  "startLine": "number",    // Optional. Line offset to start from (default: 0)
  "maxLines": "number"      // Optional. Max lines to return (default: 500)
}
```

Returns: log text + metadata (`totalLines`, `returnedLines`, `startLine`, `endLine`, `truncated`, `hint` with next page startLine).

### 3. Build Job

Trigger a Jenkins job. Automatically uses `buildWithParameters` when parameters are provided.

Input Schema:
```json
{
  "jobPath": "string",      // Required. Path to the Jenkins job
  "parameters": {           // Optional. Build parameters as key-value pairs
    "BRANCH": "main"
  }
}
```

### 4. List Jobs

List all child jobs inside a Jenkins folder. Use this to auto-discover sub-jobs (e.g. version branches) without needing to know their names in advance.

Input Schema:
```json
{
  "folderPath": "string"   // Required. Path to the Jenkins folder (e.g. "ZVML/zvml-build-release")
}
```

Returns: `folderPath`, `totalJobs`, and for each job: `name`, `url`, `disabled` (normalized from both `disabled` field and `color === 'disabled'`), `_class`.

### 5. Search Jobs

Search for Jenkins jobs by name keyword. Searches top-level jobs only (not nested folders).

Input Schema:
```json
{
  "query": "string"   // Required. Search keyword for job names
}
```

### 6. Get All Nodes

Get all Jenkins nodes (agents) and their status. No parameters required.

Returns for each node:
- Display name
- Online/offline status
- Idle status
- Temporarily offline status
- Offline cause reason
- Number of executors
- Summary totals (total / online / offline)

### 7. Get Running Builds

Get all currently running builds across all Jenkins jobs. No parameters required.

Returns:
- Total count of running builds
- For each build: full display name, URL, timestamp, estimated duration, node name

### 8. Get Build Changes

Get the list of commits/changesets included in a specific Jenkins build. Supports both single-SCM and multi-SCM (parallel checkout) jobs, deduplicating commits across repos.

Input Schema:
```json
{
  "jobPath": "string",      // Required. Path to the Jenkins job
  "buildNumber": "string"   // Optional. Build number or "lastBuild" (default: lastBuild)
}
```

Returns: `buildNumber`, `result`, `totalCommits`, `repoBreakdown` (per-repo commit count), and a `commits` array with:
- `commitId`
- `author`
- `message`
- `timestamp`
- `repo` (SCM kind)
- `repoUrl`

### 9. Find Culprit Commit

Find the commit(s) that likely caused a build failure. Walks back through previous builds (with matching parameters) to find the last successful baseline, then collects all commits introduced since.

Optionally traverses downstream Pipeline jobs triggered via `build job:` steps, using `UpstreamCause` matching to identify which downstream build was triggered by the failing parent and whether it failed.

Input Schema:
```json
{
  "jobPath": "string",             // Required. Path to the Jenkins job
  "buildNumber": "string",         // Optional. Failing build number or "lastBuild" (default: lastBuild)
  "maxBuildsToSearch": "number",   // Optional. Max builds to walk back through (default: 20)
  "downstreamJobPaths": ["string"] // Optional. List of downstream job paths to also inspect.
                                   // Example: ["ZVML/zvml-downstreams/zvml-build-frontend"]
}
```

Returns:
- `failingBuild`: the failing build number
- `buildParameters`: parameters used in the failing build
- `lastGoodBuild`: last build that passed (or "not found within search range")
- `skippedBuildsWithDifferentParams`: number of builds skipped due to parameter mismatch
- `totalSuspectCommits`: total count across parent + all downstream jobs
- `parentSuspectCommits`: commits introduced in the parent job since the last good build
- `downstreamResults`: per-downstream-job results, each containing:
  - `triggeredBuildNumber`: which downstream build was triggered by the failing parent
  - `result`: the downstream build result
  - `lastGoodBuild`: last passing build in that downstream job
  - `suspectCommits`: commits introduced in that downstream job
- `buildRange`: summary of each build checked (number, result, commit count)
