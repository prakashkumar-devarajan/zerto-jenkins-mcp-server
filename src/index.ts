#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

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

  /**
   * Normalize a job path so every segment is prefixed with /job/.
   * Accepts any of these formats:
   *   "ZVML"
   *   "ZVML/zvml_builds/ZVML_Services"
   *   "ZVML/job/zvml_builds/job/ZVML_Services"
   *   "job/ZVML/job/zvml_builds/job/ZVML_Services"
   */
  private normalizeJobPath(jobPath: string): string {
    const parts = jobPath.split('/').filter(p => p !== '' && p !== 'job');
    return parts.map(p => `job/${p}`).join('/');
  }

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
              jobPath: { type: 'string', description: 'Path to the Jenkins job' },
              buildNumber: { type: 'string', description: 'Build number or "lastBuild"' },
            },
            required: ['jobPath'],
          },
        },
        {
          name: 'get_build_log',
          description: 'Get the console output of a Jenkins build',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string' },
              buildNumber: { type: 'string' },
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
              jobPath: { type: 'string', description: 'Path to the Jenkins job' },
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
            return await this.getBuildStatus(request.params.arguments);
          case 'get_build_log':
            return await this.getBuildLog(request.params.arguments);
          case 'build_job':
            return await this.buildJob(request.params.arguments);
          case 'search_jobs':
            return await this.searchJobs(request.params.arguments);
          case 'get_all_nodes':
            return await this.getAllNodes(request.params.arguments);
          case 'get_running_builds':
            return await this.getRunningBuilds(request.params.arguments);
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

  private async getBuildStatus(args: any) {
    const buildNumber = args.buildNumber || 'lastBuild';
    const jobPath = this.normalizeJobPath(args.jobPath);
    const response = await this.axiosInstance.get<BuildStatus>(
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

  private async getBuildLog(args: any) {
    const jobPath = this.normalizeJobPath(args.jobPath);
    const response = await this.axiosInstance.get(
      `/${jobPath}/${args.buildNumber}/consoleText`
    );

    return {
      content: [
        {
          type: 'text',
          text: response.data,
        },
      ],
    };
  }

  private async getCrumb() {
    const response = await this.axiosInstance.get('/crumbIssuer/api/json');
    return response.data.crumb;
  }

  private async buildJob(args: any) {
    const crumb = await this.getCrumb();
    const params = new URLSearchParams();
    if (args.parameters) {
      Object.entries(args.parameters).forEach(([key, value]) => {
        params.append(key, String(value));
      });
    }

    const jobPath = this.normalizeJobPath(args.jobPath);
    const endpoint = args.parameters ? 'buildWithParameters' : 'build';
    await this.axiosInstance.post(`/${jobPath}/${endpoint}`, params, {
      headers: { 'Jenkins-Crumb': crumb },
    });

    return {
      content: [{ type: 'text', text: `Job "${args.jobPath}" triggered successfully` }],
    };
  }

  private async searchJobs(args: any) {
    const response = await this.axiosInstance.get('/api/json?tree=jobs[name,url]');
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

  private async getAllNodes(args: any) {
    const response = await this.axiosInstance.get('/computer/api/json?tree=computer[displayName,offline,idle,temporarilyOffline,offlineCauseReason,numExecutors,monitorData[*]]');
    const nodes = response.data.computer || [];

    const nodeInfo = nodes.map((node: any) => ({
      displayName: node.displayName,
      offline: node.offline,
      idle: node.idle,
      temporarilyOffline: node.temporarilyOffline,
      offlineCauseReason: node.offlineCauseReason || null,
      numExecutors: node.numExecutors,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(nodeInfo, null, 2),
        },
      ],
    };
  }

  private async getRunningBuilds(args: any) {
    // Get all executors and their current builds from all nodes
    const response = await this.axiosInstance.get('/computer/api/json?tree=computer[displayName,executors[currentExecutable[url,fullDisplayName,timestamp,estimatedDuration]]]');
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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jenkins MCP server running on stdio');
  }
}

const server = new JenkinsServer();
server.run().catch(console.error);
