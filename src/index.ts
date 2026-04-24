#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
        {
          name: 'get_build_changes',
          description: 'Get the list of commits/changesets included in a specific Jenkins build',
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
          name: 'find_culprit_commit',
          description: 'Find the commit(s) that likely caused a build failure. Walks back through builds with the same parameters to find the last successful baseline, then collects all commits introduced since. Optionally traverses downstream Pipeline jobs (triggered via "build job:") by matching the UpstreamCause to find which downstream build failed and what commits it introduced.',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string', description: 'Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")' },
              buildNumber: { type: 'string', description: 'The failing build number or "lastBuild" (default: lastBuild)' },
              maxBuildsToSearch: { type: 'number', description: 'Max number of previous builds to walk back through (default: 20)' },
              downstreamJobPaths: { type: 'array', items: { type: 'string' }, description: 'Optional list of downstream job paths to inspect (e.g. ["ZVML/zvml-downstreams/zvml-build-frontend", "ZVML/zvml-downstreams/zvml-build-datapath"]). For each, the tool finds the build triggered by the failing parent via UpstreamCause, and if it failed, collects its suspect commits.' },
            },
            required: ['jobPath'],
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
          case 'get_build_changes':
            return await this.getBuildChanges(request.params.arguments, this.axiosInstance);
          case 'find_culprit_commit':
            return await this.findCulpritCommit(request.params.arguments, this.axiosInstance);
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

    // Fetch job-level info (disabled flag) and build info in parallel
    const [jobResponse, buildResponse] = await Promise.all([
      axiosInstance.get(`/${jobPath}/api/json?tree=disabled,buildable,color`),
      axiosInstance.get(`/${jobPath}/${buildNumber}/api/json`),
    ]);

    const jobData = jobResponse.data;
    // A job is inactive if explicitly disabled OR not buildable OR color is "disabled"
    const disabled: boolean =
      jobData.disabled === true ||
      jobData.buildable === false ||
      jobData.color === 'disabled';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            disabled: disabled,
            building: buildResponse.data.building,
            result: buildResponse.data.result,
            timestamp: buildResponse.data.timestamp,
            duration: buildResponse.data.duration,
            url: buildResponse.data.url,
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

  private extractBuildParams(buildData: any): Record<string, string> {
    const params: Record<string, string> = {};
    const actions: any[] = buildData.actions || [];
    for (const action of actions) {
      if (Array.isArray(action.parameters)) {
        for (const p of action.parameters) {
          params[p.name] = String(p.value ?? '');
        }
      }
    }
    return params;
  }

  private paramsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => a[k] === b[k]);
  }

  // Handles both single-SCM (changeSet) and multi-SCM (changeSets[]) Jenkins responses.
  // Deduplicates by commitId across repos.
  private extractAllCommits(buildData: any): { commitId: string; author: string | null; message: string; timestamp: number; repo: string | null; repoUrl: string | null }[] {
    const seen = new Set<string>();
    const commits: { commitId: string; author: string | null; message: string; timestamp: number; repo: string | null; repoUrl: string | null }[] = [];

    const addItems = (items: any[], repoKind: string | null, remoteUrls: string[] | null) => {
      const repoUrl = remoteUrls?.[0] || null;
      for (const item of items || []) {
        const id = item.commitId || item.id || item.revision;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        commits.push({
          commitId: id || null,
          author: item.author?.fullName || null,
          message: item.msg || item.comment || null,
          timestamp: item.timestamp || item.date || null,
          repo: repoKind,
          repoUrl,
        });
      }
    };

    // Multi-SCM: changeSets is an array, one entry per repository
    if (Array.isArray(buildData.changeSets) && buildData.changeSets.length > 0) {
      for (const cs of buildData.changeSets) {
        addItems(cs.items || [], cs.kind || null, cs.remoteUrls || null);
      }
    }

    // Single-SCM fallback: changeSet (singular)
    if (buildData.changeSet?.items?.length) {
      addItems(buildData.changeSet.items, buildData.changeSet.kind || null, buildData.changeSet.remoteUrls || null);
    }

    return commits;
  }

  private jobPathToDisplayName(jobPath: string): string {
    // Convert "job/ZVML/job/zvml-build-release/job/10.10" -> "ZVML/zvml-build-release/10.10"
    if (jobPath.startsWith('job/')) {
      return jobPath.split('/').filter((s: string) => s !== 'job').join('/');
    }
    return jobPath;
  }

  // Finds the downstream build triggered by a specific upstream (parent) build number,
  // by inspecting the UpstreamCause in each downstream build's actions.
  private async findDownstreamBuildByUpstreamCause(
    downstreamJobPath: string,
    parentJobDisplayName: string,
    parentBuildNumber: number,
    axiosInstance: any
  ): Promise<{ number: number; result: string } | null> {
    try {
      const resp = await axiosInstance.get(
        `/${downstreamJobPath}/api/json?tree=builds[number,result,actions[causes[upstreamBuild,upstreamProject]]]{0,50}`
      );
      const builds: any[] = resp.data.builds || [];
      for (const build of builds) {
        const actions: any[] = build.actions || [];
        for (const action of actions) {
          for (const cause of (action.causes || [])) {
            if (
              cause.upstreamBuild === parentBuildNumber &&
              this.jobPathToDisplayName(cause.upstreamProject || '') === parentJobDisplayName
            ) {
              return { number: build.number, result: build.result };
            }
          }
        }
      }
    } catch {
      // downstream job inaccessible
    }
    return null;
  }

  private async getBuildChanges(args: any, axiosInstance: any) {
    const buildNumber = args.buildNumber || 'lastBuild';
    const jobPath = this.normalizeJobPath(args.jobPath);
    const response = await axiosInstance.get(
      `/${jobPath}/${buildNumber}/api/json?tree=number,result,changeSet[items[commitId,id,revision,author[fullName],msg,comment,timestamp,date],kind,remoteUrls],changeSets[items[commitId,id,revision,author[fullName],msg,comment,timestamp,date],kind,remoteUrls]`
    );

    const commits = this.extractAllCommits(response.data);

    // Collect per-repo breakdown for multi-SCM jobs
    const repoBreakdown: Record<string, number> = {};
    for (const c of commits) {
      const key = c.repo || 'unknown';
      repoBreakdown[key] = (repoBreakdown[key] || 0) + 1;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            buildNumber: response.data.number,
            result: response.data.result,
            totalCommits: commits.length,
            repoBreakdown,
            commits,
          }, null, 2),
        },
      ],
    };
  }

  private async findCulpritCommit(args: any, axiosInstance: any) {
    const maxBuildsToSearch = args.maxBuildsToSearch || 20;
    const jobPath = this.normalizeJobPath(args.jobPath);
    const startBuildNumber = args.buildNumber || 'lastBuild';
    const downstreamJobPaths: string[] = args.downstreamJobPaths || [];

    const treeQuery = 'number,result,actions[parameters[name,value]],changeSet[items[commitId,id,revision,author[fullName],msg,comment,timestamp,date],kind,remoteUrls],changeSets[items[commitId,id,revision,author[fullName],msg,comment,timestamp,date],kind,remoteUrls]';

    // Fetch the failing build
    const startResponse = await axiosInstance.get(
      `/${jobPath}/${startBuildNumber}/api/json?tree=${treeQuery}`
    );
    const failingBuildNumber: number = startResponse.data.number;
    const failingResult: string = startResponse.data.result;
    const failingParams = this.extractBuildParams(startResponse.data);
    const parentJobDisplayName = this.jobPathToDisplayName(jobPath);

    if (failingResult === 'SUCCESS') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Build #${failingBuildNumber} is a SUCCESS — no culprit to find.`,
              buildNumber: failingBuildNumber,
              result: failingResult,
            }, null, 2),
          },
        ],
      };
    }

    const suspectBuilds: { buildNumber: number; result: string; commits: any[] }[] = [
      { buildNumber: failingBuildNumber, result: failingResult, commits: this.extractAllCommits(startResponse.data) },
    ];

    let lastGoodBuild: number | null = null;
    let skippedDueToParamMismatch = 0;

    for (let i = 1; i <= maxBuildsToSearch; i++) {
      const candidateBuild = failingBuildNumber - i;
      if (candidateBuild < 1) break;

      let buildData: any;
      try {
        const resp = await axiosInstance.get(
          `/${jobPath}/${candidateBuild}/api/json?tree=${treeQuery}`
        );
        buildData = resp.data;
      } catch {
        continue;
      }

      // Skip builds with different parameters — they are not a valid baseline
      const candidateParams = this.extractBuildParams(buildData);
      if (!this.paramsMatch(failingParams, candidateParams)) {
        skippedDueToParamMismatch++;
        continue;
      }

      if (buildData.result === 'SUCCESS') {
        lastGoodBuild = buildData.number;
        break;
      }

      suspectBuilds.push({ buildNumber: buildData.number, result: buildData.result, commits: this.extractAllCommits(buildData) });
    }

    const parentSuspectCommits = suspectBuilds.flatMap(b =>
      b.commits.map(c => ({ ...c, source: 'parent', introducedInBuild: b.buildNumber }))
    );

    // --- Downstream job traversal ---
    // For each downstream job, find the build triggered by the failing parent via UpstreamCause,
    // then walk back through that downstream job's history to find the culprit commits.
    const downstreamResults: any[] = [];

    for (const dsPath of downstreamJobPaths) {
      const normalizedDs = this.normalizeJobPath(dsPath);

      // Find the downstream build triggered by the failing parent
      const triggeredBuild = await this.findDownstreamBuildByUpstreamCause(
        normalizedDs,
        parentJobDisplayName,
        failingBuildNumber,
        axiosInstance
      );

      if (!triggeredBuild) {
        downstreamResults.push({
          jobPath: dsPath,
          status: 'not found — no build triggered by this parent build within the last 50 downstream runs',
        });
        continue;
      }

      if (triggeredBuild.result === 'SUCCESS' || triggeredBuild.result === null) {
        downstreamResults.push({
          jobPath: dsPath,
          triggeredBuildNumber: triggeredBuild.number,
          result: triggeredBuild.result,
          status: 'passed — not a culprit source',
        });
        continue;
      }

      // The triggered downstream build failed — walk it back to find culprit commits
      const dsSuspectBuilds: { buildNumber: number; result: string; commits: any[] }[] = [];
      let dsLastGoodBuild: number | null = null;

      try {
        const dsFailResp = await axiosInstance.get(
          `/${normalizedDs}/${triggeredBuild.number}/api/json?tree=${treeQuery}`
        );
        dsSuspectBuilds.push({
          buildNumber: triggeredBuild.number,
          result: triggeredBuild.result,
          commits: this.extractAllCommits(dsFailResp.data),
        });
      } catch {
        // skip if inaccessible
      }

      for (let j = 1; j <= maxBuildsToSearch; j++) {
        const candidateDsBuild = triggeredBuild.number - j;
        if (candidateDsBuild < 1) break;

        let dsBuildData: any;
        try {
          const resp = await axiosInstance.get(
            `/${normalizedDs}/${candidateDsBuild}/api/json?tree=${treeQuery}`
          );
          dsBuildData = resp.data;
        } catch {
          continue;
        }

        if (dsBuildData.result === 'SUCCESS') {
          dsLastGoodBuild = dsBuildData.number;
          break;
        }

        dsSuspectBuilds.push({
          buildNumber: dsBuildData.number,
          result: dsBuildData.result,
          commits: this.extractAllCommits(dsBuildData),
        });
      }

      const dsSuspectCommits = dsSuspectBuilds.flatMap(b =>
        b.commits.map(c => ({ ...c, source: dsPath, introducedInBuild: b.buildNumber }))
      );

      downstreamResults.push({
        jobPath: dsPath,
        triggeredBuildNumber: triggeredBuild.number,
        result: triggeredBuild.result,
        lastGoodBuild: dsLastGoodBuild ?? 'not found within search range',
        totalSuspectCommits: dsSuspectCommits.length,
        suspectCommits: dsSuspectCommits,
        buildRange: dsSuspectBuilds.map(b => ({
          buildNumber: b.buildNumber,
          result: b.result,
          commitCount: b.commits.length,
        })),
      });
    }

    const totalSuspectCommits =
      parentSuspectCommits.length +
      downstreamResults.reduce((sum, r) => sum + (r.totalSuspectCommits || 0), 0);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            failingBuild: failingBuildNumber,
            buildParameters: failingParams,
            lastGoodBuild: lastGoodBuild ?? 'not found within search range',
            skippedBuildsWithDifferentParams: skippedDueToParamMismatch,
            totalSuspectCommits,
            parentSuspectCommits,
            downstreamResults,
            buildRange: suspectBuilds.map(b => ({
              buildNumber: b.buildNumber,
              result: b.result,
              commitCount: b.commits.length,
            })),
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
    const streamableTransports = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

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
            enableJsonResponse: true,
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

        // For GET requests (SSE stream), start heartbeat BEFORE handleRequest
        // because handleRequest never returns for GET (it keeps the SSE stream open)
        if (req.method === 'GET') {
          const heartbeat = setInterval(() => {
            if (!res.writableEnded) {
              res.write(':ping\n\n');
            } else {
              clearInterval(heartbeat);
            }
          }, 30000);
          req.on('close', () => clearInterval(heartbeat));
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

    const httpServer = app.listen(PORT, () => {
      console.error(`Jenkins MCP server running on http://0.0.0.0:${PORT}`);
      console.error(`Streamable HTTP endpoint: http://0.0.0.0:${PORT}/mcp`);
    });

    // Disable timeouts that kill long-lived SSE streams
    httpServer.requestTimeout = 0;
    httpServer.keepAliveTimeout = 0;
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
        {
          name: 'get_build_changes',
          description: 'Get the list of commits/changesets included in a specific Jenkins build',
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
          name: 'find_culprit_commit',
          description: 'Find the commit(s) that likely caused a build failure. Walks back through builds with the same parameters to find the last successful baseline, then collects all commits introduced since. Optionally traverses downstream Pipeline jobs (triggered via "build job:") by matching the UpstreamCause to find which downstream build failed and what commits it introduced.',
          inputSchema: {
            type: 'object',
            properties: {
              jobPath: { type: 'string', description: 'Path to the Jenkins job (e.g. "ZVML/zvml-build-release/10.10")' },
              buildNumber: { type: 'string', description: 'The failing build number or "lastBuild" (default: lastBuild)' },
              maxBuildsToSearch: { type: 'number', description: 'Max number of previous builds to walk back through (default: 20)' },
              downstreamJobPaths: { type: 'array', items: { type: 'string' }, description: 'Optional list of downstream job paths to inspect (e.g. ["ZVML/zvml-downstreams/zvml-build-frontend", "ZVML/zvml-downstreams/zvml-build-datapath"]). For each, the tool finds the build triggered by the failing parent via UpstreamCause, and if it failed, collects its suspect commits.' },
            },
            required: ['jobPath'],
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
          case 'get_build_changes':
            return await this.getBuildChanges(request.params.arguments, axiosInstance);
          case 'find_culprit_commit':
            return await this.findCulpritCommit(request.params.arguments, axiosInstance);
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
