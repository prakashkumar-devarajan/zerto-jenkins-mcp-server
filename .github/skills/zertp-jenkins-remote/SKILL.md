---
name: zerto-jenkins
description: Zerto Jenkins CI/CD Pipeline. Use this skill whenever the user asks about Jenkins builds, build status, build failures, build logs, console output, node status, running builds, job search, triggering jobs, culprit commits, or official build status. Also use when the user mentions downloading logs, checking build output, investigating why a build failed, or analyzing CI/CD output for any Zerto Jenkins job.
---

# Zerto Jenkins CI/CD

Interact with Zerto's Jenkins CI/CD infrastructure to monitor builds, check node status, trigger jobs, retrieve build logs, and investigate failures.

## Available MCP Tools

These tools are provided by the Jenkins MCP server for querying Jenkins state and triggering actions.

### get_build_status
Get the status of a Jenkins build including whether it's running, the result, duration, and URL.
- **jobPath** *(required)*: Path to the Jenkins job (e.g. `"ZVML/zvml-build-release/10.10"`)
- **buildNumber** *(optional)*: Build number or `"lastBuild"` (defaults to `lastBuild`)
- Returns: `disabled`, `building`, `result`, `timestamp`, `duration`, `url`

### build_job
Trigger a Jenkins job with optional parameters. Automatically uses `buildWithParameters` when parameters are provided.
- **jobPath** *(required)*: Path to the Jenkins job
- **parameters** *(optional)*: Object with build parameters (key/value pairs)

### search_jobs
Search for Jenkins jobs by name keyword. Note: Only searches top-level jobs, not nested folders.
- **query** *(required)*: Search keyword for job names

### get_all_nodes
Get status of all Jenkins nodes/agents including online status, idle state, executor count, and offline reasons. No parameters required.

### get_running_builds
List all currently running builds across Jenkins with job names, node assignments, timestamps, and progress. No parameters required.

### get_build_changes
Get the list of commits/changesets included in a specific Jenkins build.
- **jobPath** *(required)*: Path to the Jenkins job
- **buildNumber** *(optional)*: Build number or `"lastBuild"` (defaults to `lastBuild`)
- Returns: list of commits with author, message, hash, and changed files

### list_jobs
List all child jobs inside a Jenkins folder. Use this to auto-discover sub-jobs (e.g. version branches) without needing to know their names in advance.
- **folderPath** *(required)*: Path to the Jenkins folder (e.g. `"ZVML/zvml-build-release"`)
- Returns: `folderPath`, `totalJobs`, and for each job: `name`, `url`, `disabled`, `_class`

### find_culprit_commit
Find the commit(s) that likely caused a build failure. Walks back through previous builds to find the last successful baseline, then collects all commits introduced since. Optionally traverses downstream Pipeline jobs (triggered via `build job:`) using `UpstreamCause` matching to find which downstream build failed and what commits it introduced.
- **jobPath** *(required)*: Path to the Jenkins job
- **buildNumber** *(optional)*: The failing build number or `"lastBuild"` (default: `lastBuild`)
- **maxBuildsToSearch** *(optional)*: Max number of previous builds to walk back through (default: `20`)
- **downstreamJobPaths** *(optional)*: Array of downstream job paths to also inspect (e.g. `["ZVML/zvml-downstreams/zvml-build-frontend", "ZVML/zvml-downstreams/zvml-build-datapath"]`). For each, the tool finds the build triggered by the failing parent via `UpstreamCause`, and if it failed, collects its suspect commits.
- Returns: `parentSuspectCommits`, `downstreamResults`, `totalSuspectCommits`, `buildRange`

## Build Log Retrieval (Script-Based)

For build logs, use the bundled `scripts/get-build-log.py` script instead of an MCP tool. This downloads the entire console log to a local file for analysis with shell tools — far more effective than paginated MCP responses for large logs.

Run the script from this skill's directory. It requires `uv` and reads Jenkins credentials from environment variables (`JENKINS_USER`, `JENKINS_TOKEN`) via `.env`.

### Command Format

```bash
uv run scripts/get-build-log.py "<jobPath>" <buildNumber> > tmp/<descriptive-name>.log
```

### Parameters

- **jobPath**: Slash-separated Jenkins job path (e.g. `ZVML/zvml-build-release/10.10`)
- **buildNumber**: Numeric build number or `lastBuild`
- **--tail N**: Optional — return only the last N lines (useful for quick error checks)
- **--server host:port**: Optional — override the default Jenkins server (`zbuildsrv1.zerto.local:8443`)

### Examples

```bash
# Download full log for ZVML 10.10 build 794
uv run scripts/get-build-log.py "ZVML/zvml-build-release/10.10" 794 > tmp/zvml-10.10-794.log

# Download last build log
uv run scripts/get-build-log.py "ZVML/zvml-build-release/10.10" lastBuild > tmp/zvml-10.10-last.log

# Download only tail (last 500 lines) for quick error check
uv run scripts/get-build-log.py "ZVML/zvml-build-release/10.10" 794 --tail 500 > tmp/zvml-10.10-794-tail.log
```

### File Naming Convention

Save logs to `tmp/` with descriptive names: `tmp/<product>-<version>-<buildNumber>.log`
Examples: `tmp/zvml-10.10-794.log`, `tmp/zvm-10.9.0-1592.log`, `tmp/frontend-10.10-last.log`

## Analyzing Downloaded Logs

After downloading, use file tools and shell commands to analyze. Never try to read the full log into context — these logs can be tens of thousands of lines. Use targeted extraction instead.

### Get log size and overview

```bash
wc -l tmp/<logfile>.log
```

### Check the end of the log first

Build failures almost always print the terminal error in the last 200–400 lines:

```bash
tail -400 tmp/<logfile>.log
```

Or read the last section with the file reading tool.

### Search for error patterns

Use grep to find errors without reading the entire file:

```bash
# General failure markers
grep -n -i "FAILURE\|FAILED\|ERROR\|Exception" tmp/<logfile>.log | tail -30
```

### Extract context around errors

Once you find an error line number, read surrounding context:

```bash
# Show 10 lines before and after line 5432
sed -n '5422,5442p' tmp/<logfile>.log
```

Or use the file reading tool with the line range.

### Find downstream job references

Parent pipeline logs often contain references to triggered downstream jobs:

```bash
# Find downstream build references
grep -n "build job:\|Triggering\|completed:" tmp/<logfile>.log
```

## Job Path Format

For nested Jenkins folders, use the `job/` prefix format when calling MCP tools:
- Simple job: `my-job`
- Nested folder: `job/ZVML/job/zvml-build-release/job/10.10`

Example: `ZVML/zvml-build-release/10.10` → `job/ZVML/job/zvml-build-release/job/10.10`

The `scripts/get-build-log.py` script accepts slash-separated paths directly (e.g. `ZVML/zvml-build-release/10.10`) — no `job/` prefix needed.

## Example Prompts

### Build Monitoring
- "What builds are currently running on Jenkins?"
- "How many builds are in progress?"
- "Show me all ZVML builds running right now"

### Build Status
- "Get the status of ZVML 10.10 build #550"
- "What was the result of the last Frontend build?"
- "Is build #525 still running?"

### Build Logs
- "Get me the build log for ZVML 10.10 build #794"
- "Download the console output for the last Frontend build"

### Node Status
- "Are there any offline Jenkins nodes?"
- "Which nodes are currently idle?"
- "Show me all Linux build nodes"
- "How many executors are available?"

### Job Search & Triggering
- "Search for ZVML related jobs"
- "Find all frontend jobs"
- "Trigger a build for the Frontend orchestrator job"

## Common Job Paths

| Job | MCP Tool Path | Script Path |
|-----|---------------|-------------|
| ZVML 10.10 Release | `job/ZVML/job/zvml-build-release/job/10.10` | `ZVML/zvml-build-release/10.10` |
| ZVML 10.9 Release | `job/ZVML/job/zvml-build-release/job/10.9` | `ZVML/zvml-build-release/10.9` |
| ZVML 10.8 Release | `job/ZVML/job/zvml-build-release/job/10.8` | `ZVML/zvml-build-release/10.8` |
| Frontend Orchestrator 10.10 | `job/Frontend/job/Frontend_CI/job/frontend_orchestrator_release/job/10.10` | `Frontend/Frontend_CI/frontend_orchestrator_release/10.10` |
| Backend PR Check | `job/CI/job/ZVM/job/zvm_backend_pr_check` | `CI/ZVM/zvm_backend_pr_check` |

## Official Builds

**Official builds are every ENABLED pipeline under `ZVML/zvml-build-release/` (ZVML) and `ZVM/release/` (ZVM).** Disabled jobs (via the "Disable Project" button in Jenkins) are NOT official builds and must be excluded.

| Product | Folder |
|---------|--------|
| **ZVML** | `job/ZVML/job/zvml-build-release/` |
| **ZVM** | `job/ZVM/job/release/` |

### How to Identify Active vs Disabled Jobs

The `get_build_status` tool returns a `disabled` field:
- `"disabled": false` → **active official build** — include in results
- `"disabled": true` → **disabled job** — exclude from results, do not report

When listing official builds, always filter out any job where `disabled: true`.

### How to Query Official Builds

Use `list_jobs` to auto-discover all sub-jobs in a folder, then query only the enabled ones:

1. Call `list_jobs(folderPath="ZVML/zvml-build-release")` to get all version sub-jobs with their `disabled` status
2. Filter out any where `disabled: true`
3. Call `get_build_status` with `buildNumber="lastBuild"` for each enabled version in parallel
4. Report only the active ones

### Example Prompts for Official Builds
- "What's the status of all official builds?"
- "ZVML official build status"
- "ZVM official build status"
- "Show me running official builds"
- "Are there any failing official builds?"

## Failure Investigation Methodology

> **MANDATORY BEHAVIOR**: Whenever a build failure is reported or discovered, ALWAYS perform the full investigation below — do not stop at the parent build log. Automatically drill into failing downstream jobs, read their logs, classify the failure, and if it is a code issue, automatically run `find_culprit_commit` to identify the responsible commit. Do not ask the user whether to proceed — just do it.

When a build fails, use this drill-down approach to find the root cause:

### Step 1: Get Parent Build Status
```
get_build_status(jobPath="job/ZVM/job/release/job/10.9.0", buildNumber="1592")
```
Check the result and identify which stage failed.

### Step 2: Download the Parent Build Log

```bash
uv run scripts/get-build-log.py "ZVM/release/10.9.0" 1592 > tmp/zvm-10.9.0-1592.log
```

Search the log for:
```bash
tail -400 tmp/zvm-10.9.0-1592.log
grep -n "FAILURE\|completed: FAILURE" tmp/zvm-10.9.0-1592.log
```
- `FAILURE` or `completed: FAILURE`
- Downstream job names with build numbers (e.g., `ci_build_zvm_backend #48849`)
- Stage names like "Failed in branch BuildBackend"

### Step 3: Drill Into Failed Downstream Jobs — Recursively Until the Leaf (ALWAYS DO THIS)

**CRITICAL RULE**: Never stop investigating at the parent build log. You MUST keep drilling into downstream jobs, level by level, until you reach the innermost job that has no further downstream — that is the actual root cause.

Once you identify a failed downstream job from a parent log, immediately download and read its log:

```bash
uv run scripts/get-build-log.py "<downstream-job-path>" <downstream-build-number> > tmp/<downstream>.log
tail -400 tmp/<downstream>.log
```

For each log you read:
1. Look for lines matching `completed: ABORTED`, `completed: FAILURE`, or `Failed in branch <name>`
2. Extract the downstream job name and build number from those lines
3. Download that downstream job's log
4. Repeat steps 1–3 until the log shows **no further downstream jobs** — only then have you found the real root cause

**Example traversal** (do not stop early):
```
Parent build log         → "zvml-build-frontend #52031 completed: ABORTED"
  → zvml-build-frontend  → "frontend_orchestrator_release/10.9.0 #1153 completed: ABORTED"
    → frontend_orchestrator → "ci_upload_frontend_zvml_docker #5091 completed: ABORTED"
      → ci_upload_frontend_zvml_docker → "Timeout has been exceeded during Artifactory upload" ← REAL ROOT CAUSE
```

- Always read from the **end** of the log first (last 200–400 lines) where terminal errors appear
- If a downstream job path is not immediately obvious, use `list_jobs` or `search_jobs` to locate it
- Never report "X was aborted/failed" as the root cause if X itself triggered further downstream jobs

### Step 4: Look for Error Patterns

> **Do not limit scanning to the examples below.** Read the full log content and apply general reasoning to identify any error, regardless of build system or language. The examples below are common fast-scan anchors — always look beyond them.

Start near the **end of the log** (last 200–400 lines) where the terminal error is usually printed. Common patterns across build systems:

**MSBuild / .NET:**
- `error MSB3021`: File copy failures (often file locking issues)
- `error MSB3073`: Command exited with non-zero code
- `error CS`: C# compilation errors
- `error :`: General MSBuild errors

**Gradle / Java / Kotlin:**
- `BUILD FAILED`
- `> Task :xxx FAILED`
- `Exception in thread "main"`
- `java.lang.` / `kotlin.` exception traces

**Docker / Container:**
- `Error response from daemon:`
- `failed to solve:`
- `exit code:` in docker run output

**Shell / Bash / PowerShell:**
- `command not found`
- `Exit status 1` / `exit code 1`
- `The term '...' is not recognized`
- `Access is denied`

**Python:**
- `Traceback (most recent call last):`
- `ModuleNotFoundError` / `ImportError`
- `SyntaxError`

**NuGet / npm / pip package restore:**
- `Unable to resolve` / `Package not found`
- `npm ERR!`
- `ERROR: Could not find a version`

**Git / SCM:**
- `fatal: unable to access`
- `error: failed to push`
- `Authentication failed`

**General indicators (any build system):**
- Lines containing `ERROR`, `FAILED`, `FATAL`, `Exception`, `Traceback`, `exit code [non-zero]`
- Anything immediately before `Finished: FAILURE`

### Step 5: Classify the Failure

Determine whether the failure is an **infrastructure issue** or a **code issue**:

| Failure Type | Indicators | Action |
|---|---|---|
| **Infrastructure** | File locking (MSB3021), network errors, agent offline, NuGet restore failure, timeout, git fetch failure | Report root cause. Rebuilding typically resolves this. No culprit commit needed. |
| **Code Issue** | Compilation errors (`error CS`), test failures, assertion errors, missing symbols | Proceed to Step 6 to find the culprit commit. |

### Step 6: Find Culprit Commit (For Code Issues ONLY)

If and only if the failure is a **code issue**, automatically call `find_culprit_commit` to identify which commit caused the regression. Do not wait for the user to ask:

```
find_culprit_commit(
  jobPath="ci_build_zvm_backend",
  buildNumber="48849",
  maxBuildsToSearch=20,
  downstreamJobPaths=["ci_build_zvm_backend"]  // add nested downstream paths if applicable
)
```

- Compare the failing build against the most recent **previously passing** build
- Report the suspect commit(s): author, commit hash, commit message, and timestamp
- Cross-reference the changed files with the error to confirm relevance

### Example: Infrastructure Failure
| Level | Job | Finding |
|-------|-----|---------|
| Pipeline | ZVM/release/10.9.0 #1592 | Failed in branch BuildBackend |
| Downstream | ci_build_zvm_backend #48849 | MSB3021: Unable to copy Zerto.FlrTool.exe |
| **Root Cause** | ZBUILD8 | File locked by .NET Host processes during parallel build |

**Conclusion:** Infrastructure issue (file locking), not a code problem. Rebuilding typically resolves this.

### Example: Code Failure with Culprit Commit
| Level | Job | Finding |
|-------|-----|---------|
| Pipeline | ZVM/release/10.9.10 #1800 | Failed in branch BuildBackend |
| Downstream | ci_build_zvm_backend #50200 | `error CS0117`: type does not contain definition |
| **Culprit** | `find_culprit_commit` result | Commit `abc123` by Jane Doe — "Refactor VpgManager interface" |

**Conclusion:** Code issue. Suspect commit identified and reported automatically.

### Common Root Causes
| Error | Cause | Type | Resolution |
|-------|-------|------|------------|
| MSB3021 (Access denied) | File locked during parallel build | Infrastructure | Rebuild, clean workspace |
| CS compilation error | Code change broke build | Code | Find culprit commit |
| Test failure / assertion error | Code regression | Code | Find culprit commit |
| Timeout | Build agent overloaded | Infrastructure | Rebuild, check agent health |
| git fetch failed | Network/GitHub issue | Infrastructure | Rebuild |
| NuGet restore failed | Package feed issue | Infrastructure | Check Artifactory, rebuild |

## Connection Issues

The log download script connects to Jenkins at `zbuildsrv1.zerto.local:8443`. If it fails with a connection error, the user is likely not connected to the corporate VPN. Tell them to connect and retry.

## Tips

1. **For MCP tools**: Always use `job/FOLDER/job/SUBFOLDER/job/JOB` format for job paths
2. **For the log script**: Use simple slash-separated paths (e.g. `ZVML/zvml-build-release/10.10`)
3. **Offline nodes**: Filter results for `"NOT_RELEVANT"` suffix to identify deprecated nodes
4. **Running builds**: Results include estimated duration to gauge completion time
5. **Build triggers**: Ensure you have appropriate Jenkins permissions before triggering builds
