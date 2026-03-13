#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import express from 'express';

const JENKINS_URL = process.env.JENKINS_URL || '';
const JENKINS_USER = process.env.JENKINS_USER || '';
const JENKINS_TOKEN = process.env.JENKINS_TOKEN || '';

interface BuildStatus {
  building: boolean;
  result: string | null;
  timestamp: number;
  duration: number;
  url: string;
}

class JenkinsServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'jenkins-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: JENKINS_URL,
      auth: {
        username: JENKINS_USER,
        password: JENKINS_TOKEN,
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_build_status',
          description: 'Get the status of a Jenkins build',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string', description: 'Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")' },
              buildNumber: { type: 'string', description: 'Build number or "lastBuild"' },
            },
            required: ['jobPath'],
          },
        },
        {
          name: 'get_build_log',
          description: 'Get the console output of a Jenkins build. Returns paginated results (default 500 lines). Use startLine to paginate.',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string', description: 'Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")' },
              buildNumber: { type: 'string' },
              startLine: { type: 'number', description: 'Line offset to start from (default: 0)' },
              maxLines: { type: 'number', description: 'Max lines to return (default: 500)' },
            },
            required: ['jobPath', 'buildNumber'],
          },
        },
        {
          name: 'build_job',
          description: 'Trigger a Jenkins job, automatically choosing build or buildWithParameters',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string', description: 'Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")' },
              parameters: { type: 'object', description: 'Optional build parameters', additionalProperties: true },
            },
            required: ['jobPath'],
          },
        },
        {
          name: 'search_jobs',
          description: 'Search for Jenkins jobs by name',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search keyword for job names' },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_all_nodes',
          description: 'Get all Jenkins nodes (agents) and their status',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_running_builds',
          description: 'Get all currently running builds across all Jenkins jobs',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));
  
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'get_build_status':
            return await this.getBuildStatus(request.params.arguments, this.axiosInstance);
          case 'get_build_log':
            return await this.getBuildLog(request.params.arguments, this.axiosInstance);
          case 'build_job':
            return await this.buildJob(request.params.arguments, this.axiosInstance);
          case 'search_jobs':
            return await this.searchJobs(request.params.arguments, this.axiosInstance);
          case 'get_all_nodes':
            return await this.getAllNodes(request.params.arguments, this.axiosInstance);
          case 'get_running_builds':
            return await this.getRunningBuilds(request.params.arguments, this.axiosInstance);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        if (axios.isAxiosError(error)) {
          throw new McpError(ErrorCode.InternalError, `Jenkins API error: ${error.response?.data?.message || error.message}`);
        }
        throw new McpError(ErrorCode.InternalError, 'Unknown error occurred');
      }
    });
  }

  private normalizeJobPath(jobPath: string): string {
    // If already in Jenkins URL format (starts with job/), return as-is
    if (jobPath.startsWith('job/')) return jobPath;
    // Convert simple path like "ZVML/zvml-build-release/10.10"
    // to Jenkins format "job/ZVML/job/zvml-build-release/job/10.10"
    return jobPath.split('/').map(segment => `job/${segment}`).join('/');
  }

  private async getBuildStatus(args: any, axiosInstance: any) {
    const buildNumber = args.buildNumber || 'lastBuild';
    const jobPath = this.normalizeJobPath(args.jobPath);
    const response = await axiosInstance.get(
      `/${jobPath}/${buildNumber}/api/json`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            building: response.data.building,
            result: response.data.result,
            timestamp: response.data.timestamp,
            duration: response.data.duration,
            url: response.data.url,
          }, null, 2),
        },
      ],
    };
  }

  private async getBuildLog(args: any, axiosInstance: any) {
    const jobPath = this.normalizeJobPath(args.jobPath);
    const response = await axiosInstance.get(
      `/${jobPath}/${args.buildNumber}/consoleText`
    );

    const MAX_LINES = args.maxLines || 500;
    const startLine = args.startLine || 0;
    const fullLog: string = typeof response.data === 'string' ? response.data : String(response.data);
    const lines = fullLog.split('\n');
    const totalLines = lines.length;
    const sliced = lines.slice(startLine, startLine + MAX_LINES);
    const truncated = totalLines > startLine + MAX_LINES;

    return {
      content: [
        {
          type: 'text',
          text: sliced.join('\n'),
        },
        {
          type: 'text',
          text: JSON.stringify({
            totalLines,
            returnedLines: sliced.length,
            startLine,
            endLine: startLine + sliced.length,
            truncated,
            hint: truncated ? `Use startLine=${startLine + MAX_LINES} to get next page` : undefined,
          }),
        },
      ],
    };
  }
  
  private async getCrumb(axiosInstance: any) {
    const response = await axiosInstance.get('/crumbIssuer/api/json');
    return response.data.crumb;
  }

  private async buildJob(args: any, axiosInstance: any) {
    const crumb = await this.getCrumb(axiosInstance);
    const jobPath = this.normalizeJobPath(args.jobPath);
    const params = new URLSearchParams();
    if (args.parameters) {
      Object.entries(args.parameters).forEach(([key, value]) => {
        params.append(key, String(value));
      });
    }
  
    const endpoint = args.parameters ? 'buildWithParameters' : 'build';
    await axiosInstance.post(`/${jobPath}/${endpoint}`, params, {
      headers: { 'Jenkins-Crumb': crumb },
    });
  
    return {
      content: [{ type: 'text', text: `Job "${args.jobPath}" triggered successfully`}],
    };
  }
  
  private async searchJobs(args: any, axiosInstance: any) {
    const response = await axiosInstance.get('/api/json?tree=jobs[name,url]');
    const jobs = response.data.jobs || [];
    
    const matches = jobs.filter((job: any) =>
      job.name.toLowerCase().includes(args.query.toLowerCase())
    );
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(matches, null, 2),
        },
      ],
    };
  }

  private async getAllNodes(args: any, axiosInstance: any) {
    const response = await axiosInstance.get('/computer/api/json?tree=computer[displayName,offline,idle,temporarilyOffline,offlineCauseReason,numExecutors]');
    const nodes = response.data.computer || [];
    
    const nodeInfo = nodes.map((node: any) => ({
      displayName: node.displayName,
      offline: node.offline,
      idle: node.idle,
      temporarilyOffline: node.temporarilyOffline,
      offlineCauseReason: node.offlineCauseReason || null,
      numExecutors: node.numExecutors,
    }));

    const summary = {
      total: nodeInfo.length,
      online: nodeInfo.filter((n: any) => !n.offline).length,
      offline: nodeInfo.filter((n: any) => n.offline).length,
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ summary, nodes: nodeInfo }),
        },
      ],
    };
  }

  private async getRunningBuilds(args: any, axiosInstance: any) {
    // Get all executors and their current builds from all nodes
    const response = await axiosInstance.get('/computer/api/json?tree=computer[displayName,executors[currentExecutable[url,fullDisplayName,timestamp,estimatedDuration]]]');
    const computers = response.data.computer || [];
    
    const runningBuilds: any[] = [];
    
    // Collect all running builds from all executors
    computers.forEach((computer: any) => {
      if (computer.executors && computer.executors.length > 0) {
        computer.executors.forEach((executor: any) => {
          if (executor.currentExecutable) {
            const build = executor.currentExecutable;
            runningBuilds.push({
              fullDisplayName: build.fullDisplayName,
              url: build.url,
              timestamp: build.timestamp,
              estimatedDuration: build.estimatedDuration,
              nodeName: computer.displayName,
            });
          }
        });
      }
    });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            totalRunningBuilds: runningBuilds.length,
            builds: runningBuilds,
          }, null, 2),
        },
      ],
    };
  }

  async run() {
    const serverMode = process.env.SERVER_MODE || 'stdio';
    
    if (serverMode === 'http') {
      await this.runHttpServer();
    } else {
      await this.runStdioServer();
    }
  }

  private async runStdioServer() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jenkins MCP server running on stdio');
  }

  private async runHttpServer() {
    const app = express();
    const PORT = process.env.PORT || 3000;

    // Store active transports by session ID
    const sseTransports = new Map<string, SSEServerTransport>();
    const streamableTransports = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

    // Note: Do NOT use express.json() globally - SSEServerTransport needs raw body stream

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', server: 'jenkins-mcp-server' });
    });

    // Streamable HTTP endpoint (recommended MCP transport)
    app.all('/mcp', express.json({ limit: '1mb' }), async (req, res) => {
      const headerSessionId = req.headers['mcp-session-id'];
      const sessionId = Array.isArray(headerSessionId) ? headerSessionId[0] : headerSessionId;

      try {
        let connection = sessionId ? streamableTransports.get(sessionId) : undefined;

        if (!connection) {
          if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
            res.status(400).json({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Bad Request: No valid MCP session ID provided',
              },
              id: null,
            });
            return;
          }

          const credentials = this.resolveJenkinsCredentials(req.headers.authorization, res);
          if (!credentials) return;

          const connectionServer = new Server(
            {
              name: 'jenkins-server',
              version: '0.1.0',
            },
            {
              capabilities: {
                tools: {},
              },
            }
          );

          const axiosInstance = axios.create({
            baseURL: JENKINS_URL,
            auth: {
              username: credentials.jenkinsUser,
              password: credentials.jenkinsToken,
            },
          });

          this.setupToolHandlersForConnection(connectionServer, axiosInstance);
          connectionServer.onerror = (error) => {
            console.error('[Streamable HTTP Connection Error]', error);
          };

          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              streamableTransports.set(newSessionId, { transport, server: connectionServer });
              console.error(`Streamable HTTP session ${newSessionId} registered`);
            },
          });

          transport.onclose = () => {
            const closedSessionId = transport.sessionId;
            if (closedSessionId) {
              streamableTransports.delete(closedSessionId);
              console.error(`Streamable HTTP session ${closedSessionId} closed`);
            }
          };

          await connectionServer.connect(transport);
          connection = { transport, server: connectionServer };
        }

        await connection.transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling streamable MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    // SSE endpoint for MCP
    app.get('/sse', async (req, res) => {
      console.error('Client connected to SSE endpoint');

      const credentials = this.resolveJenkinsCredentials(req.headers.authorization, res);
      if (!credentials) return;
      
      try {
        // Create a new server instance for this connection
        const connectionServer = new Server(
          {
            name: 'jenkins-server',
            version: '0.1.0',
          },
          {
            capabilities: {
              tools: {},
            },
          }
        );

        // Create axios instance with user's credentials
        const axiosInstance = axios.create({
          baseURL: JENKINS_URL,
          auth: {
            username: credentials.jenkinsUser,
            password: credentials.jenkinsToken,
          },
        });

        // Setup handlers for this connection
        this.setupToolHandlersForConnection(connectionServer, axiosInstance);
        
        // Setup error handler
        connectionServer.onerror = (error) => {
          console.error('[SSE Connection Error]', error);
        };
        
        console.error('Creating SSE transport...');
        const transport = new SSEServerTransport('/message', res);
        
        // Store transport for message routing
        const sessionId = transport.sessionId;
        sseTransports.set(sessionId, transport);
        console.error(`Session ${sessionId} registered`);
        
        console.error('Connecting server to transport...');
        await connectionServer.connect(transport);
        console.error('Server connected successfully via SSE');
        
        // Handle client disconnect
        req.on('close', () => {
          console.error(`Client disconnected from SSE endpoint (session: ${sessionId})`);
          sseTransports.delete(sessionId);
          transport.close().catch(err => console.error('Error closing SSE transport:', err));
        });
      } catch (error) {
        console.error('Error setting up SSE connection:', error);
        if (!res.headersSent) {
          res.status(500).end();
        }
      }
    });

    // POST endpoint for receiving messages from clients
    app.post('/message', async (req, res) => {
      const sessionId = req.query.sessionId as string;
      console.error(`Received message for session: ${sessionId}`);
      
      const transport = sseTransports.get(sessionId);
      if (!transport) {
        console.error(`No transport found for session: ${sessionId}`);
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      try {
        await transport.handlePostMessage(req, res);
      } catch (error) {
        console.error('Error handling message:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to handle message' });
        }
      }
    });

    const httpServer = app.listen(PORT, () => {
      console.error(`Jenkins MCP server running on http://0.0.0.0:${PORT}`);
      console.error(`Streamable HTTP endpoint: http://0.0.0.0:${PORT}/mcp`);
      console.error(`SSE endpoint: http://0.0.0.0:${PORT}/sse`);
    });

    // Increase timeouts to prevent SSE stream disconnects
    httpServer.keepAliveTimeout = 10 * 60 * 1000; // 10 minutes
    httpServer.headersTimeout = 11 * 60 * 1000;   // 11 minutes (must be > keepAliveTimeout)
  }

  private resolveJenkinsCredentials(
    authHeader: string | undefined,
    res: express.Response
  ): { jenkinsUser: string; jenkinsToken: string } | null {
    let jenkinsUser = JENKINS_USER;
    let jenkinsToken = JENKINS_TOKEN;

    if (authHeader && authHeader.startsWith('Basic ')) {
      const base64Credentials = authHeader.slice(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [user, token] = credentials.split(':');
      if (user && token) {
        jenkinsUser = user;
        jenkinsToken = token;
        console.error(`Using credentials for user: ${user}`);
      }
    } else if (!jenkinsUser || !jenkinsToken) {
      console.error('No credentials provided and no default credentials configured');
      res.status(401).setHeader('WWW-Authenticate', 'Basic realm="Jenkins MCP Server"');
      res.json({ error: 'Authentication required. Provide Jenkins credentials via Basic Auth.' });
      return null;
    }

    return { jenkinsUser, jenkinsToken };
  }

  private setupToolHandlersForConnection(server: Server, axiosInstance: any) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_build_status',
          description: 'Get the status of a Jenkins build',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string', description: 'Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")' },
              buildNumber: { type: 'string', description: 'Build number or "lastBuild"' },
            },
            required: ['jobPath'],
          },
        },
        {
          name: 'get_build_log',
          description: 'Get the console output of a Jenkins build. Returns paginated results (default 500 lines). Use startLine to paginate.',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string', description: 'Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")' },
              buildNumber: { type: 'string' },
              startLine: { type: 'number', description: 'Line offset to start from (default: 0)' },
              maxLines: { type: 'number', description: 'Max lines to return (default: 500)' },
            },
            required: ['jobPath', 'buildNumber'],
          },
        },
        {
          name: 'build_job',
          description: 'Trigger a Jenkins job, automatically choosing build or buildWithParameters',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string', description: 'Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")' },
              parameters: { type: 'object', description: 'Optional build parameters', additionalProperties: true },
            },
            required: ['jobPath'],
          },
        },
        {
          name: 'search_jobs',
          description: 'Search for Jenkins jobs by name',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search keyword for job names' },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_all_nodes',
          description: 'Get all Jenkins nodes (agents) and their status',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_running_builds',
          description: 'Get all currently running builds across all Jenkins jobs',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'get_build_status':
            return await this.getBuildStatus(request.params.arguments, axiosInstance);
          case 'get_build_log':
            return await this.getBuildLog(request.params.arguments, axiosInstance);
          case 'build_job':
            return await this.buildJob(request.params.arguments, axiosInstance);
          case 'search_jobs':
            return await this.searchJobs(request.params.arguments, axiosInstance);
          case 'get_all_nodes':
            return await this.getAllNodes(request.params.arguments, axiosInstance);
          case 'get_running_builds':
            return await this.getRunningBuilds(request.params.arguments, axiosInstance);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        if (axios.isAxiosError(error)) {
          throw new McpError(ErrorCode.InternalError, `Jenkins API error: ${error.response?.data?.message || error.message}`);
        }
        throw new McpError(ErrorCode.InternalError, 'Unknown error occurred');
      }
    });
  }
}

const server = new JenkinsServer();
server.run().catch(console.error);
