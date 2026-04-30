---
name: jira-bug-creation
description: >
  Create Jira blocker bugs for Zerto build/CI failures. Use when: a Jenkins build fails, opening a blocker,
  reporting a CI failure, creating bugs for compilation errors, test failures, or any defects in ZVM, ZVML,
  SaaS Agent, or other Zerto components. Handles ZER vs INT project routing, component lead lookup,
  all required custom fields, and post-creation steps including Slack notification and investigation
  summary updates. Do NOT skip this skill and try to create the Jira issue manually.
---

# Jira Bug Creation for Zerto Projects

## Overview

This skill covers the full end-to-end flow for creating blocker bugs from Jenkins CI/CD failures in
Zerto's Jira instance (zerto.atlassian.net). It handles project routing (ZER vs INT), component lead
lookup, all mandatory custom fields, and post-creation outputs (investigation summary update + Slack).

---

## Step 1: Classify the Failure and Route to Project

The classification determines which Jira project to use:

| Classification | Examples | Jira Project |
|---|---|---|
| **Infrastructure** | File locking, network errors, agent offline, NuGet restore crash, timeout, git fetch failure, missing Dockerfile | **INT** |
| **Code Issue** | Compilation errors (`error CS`), test failures, assertion errors, missing symbols, undefined variables | **ZER** |

> **Note:** Use the classification from your build investigation — do NOT re-classify here.

---

## Step 2: Determine Component and Component Lead

### If Infrastructure (INT project):
- Component: **"DevOps"** (id: `10930` in INT project)
- Component Lead: **Tomer Paretsky** — resolve via `lookupJiraAccountId("Tomer Paretsky")`

### If Code Issue (ZER project):

**Method A — Via PR URL (preferred when PR is available):**
1. Use GitHub MCP to fetch the PR description from the PR URL:
   ```
   github_get_pull_request(url: <PR_URL>)
   -> read response.body
   ```
2. Extract Jira ticket key from PR description using regex: `[A-Z]+-\d+` (e.g. `ZER-12345`) — use first match
3. Fetch that Jira ticket via Jira MCP -> read `fields.components[0].name`
4. Look up component lead from the table below

**Method B — Via failure context (when no PR URL):**
- Determine the component from the failing build name, repository, or error context
- Map to component lead using the table below

**Component -> Lead Mapping (ZER project, April 2026):**

| Component | Component Lead |
|---|---|
| AI Agents | Dana Mittelman |
| APPLIANCE core | Naphtali Davies |
| APPLIANCE Deploy | Naphtali Davies |
| APPLIANCE Upgrade | Naphtali Davies |
| CoreManagementBugMaster components (ZVM vpg management, ZVM import export vpg) | CoreManagementBugMaster |
| DB-Management utility | Yaniv Norman |
| DevOps | Tomer Paretsky |
| Diagnostic tool | Eitan Rapaport |
| DISABLED - ZSA | Eitan Rapaport |
| Driver qemu | Driver BugMaster |
| DRIVER hyperv | Driver BugMaster |
| DRIVER vc | Driver BugMaster |
| DSS | VraBugMaster@hpe.com |
| GLDR ZVMAGENT | Yossi Cherniak |
| index search | OR_BugMaster@hpe.com |
| Interoperability Matrix | Hadar Gabizon |
| KEYCLOAK | Roopali Gupta |
| Log Collection | Kukkuteswara rao kota |
| Log Parser | Eitan Rapaport |
| Management Console FE | Hadar Gabizon |
| Partner Hub Service | Dilip Chaudhary |
| PromotionWorker | Dana Mittelman |
| RansomwareBugMaster components (ZVM checkpoints, ZVM licensing Infra, ZVM sync workflow) | RansomwareBugMaster |
| RecoveryOperationsBugMaster components (ZVM clone, ZVM dr recovery flows, ZVM FOL and Move, ZVM FOT, ZVM vm journal restore, ZVM volumes resource management, ZVM vra control) | RecoveryOperationsBugMaster |
| SETTINGS service | Roopali Gupta |
| VBA | OR_BugMaster@hpe.com |
| VBA flr | OR_BugMaster@hpe.com |
| VBA fssharp | OR_BugMaster@hpe.com |
| VRA | VraBugMaster@hpe.com |
| VRA encryption detection | VraBugMaster@hpe.com |
| VRA SYSTEM | VraBugMaster@hpe.com |
| VSS | VraBugMaster@hpe.com |
| ZCM BE | George Khubua |
| ZCM FE | Kukkuteswara rao kota |
| ZCC | George Khubua |
| ZER Documentation | Leah Goldman |
| ZORG filtering | George Khubua |
| ZVM App Level Services | Miri Cohen |
| ZVM AVS | George Khubua |
| ZVM aws | Dana Mittelman |
| ZVM azure | Dana Mittelman |
| ZVM checkpoints | RansomwareBugMaster |
| ZVM clone | RecoveryOperationsBugMaster |
| ZVM cmdlets infra | George Khubua |
| ZVM core services | CoreManagementBugMaster |
| ZVM dr recovery flows | RecoveryOperationsBugMaster |
| ZVM FE App bar | Hadar Gabizon |
| ZVM FE Dashboard page | Hadar Gabizon |
| ZVM FE Extended Journal page | Hadar Gabizon |
| ZVM FE Infra | Hadar Gabizon |
| ZVM FE Monitoring page | Hadar Gabizon |
| ZVM FE Recovery wizards | Hadar Gabizon |
| ZVM FE Reports page | Hadar Gabizon |
| ZVM FE Restore wizards | Hadar Gabizon |
| ZVM FE Setup page | Hadar Gabizon |
| ZVM FE Site menu | Kukkuteswara rao kota |
| ZVM FE Sites page | Hadar Gabizon |
| ZVM FE VMs page | Hadar Gabizon |
| ZVM FE VPG wizard | Hadar Gabizon |
| ZVM FE VPGs page | Hadar Gabizon |
| ZVM flr | OR_BugMaster@hpe.com |
| ZVM FOL and Move | RecoveryOperationsBugMaster |
| ZVM FOT | RecoveryOperationsBugMaster |
| ZVM for DevEscalation | DevEscalationBugMaster |
| ZVM gldr sync | Yossi Cherniak |
| ZVM hyperv | Moshe Taieb |
| ZVM import export vpg | CoreManagementBugMaster |
| ZVM licensing Infra | RansomwareBugMaster |
| ZVM linux configuration service | Naphtali Davies |
| ZVM ltr core | LTR_BugMaster |
| ZVM ransomware | RansomwareBugMaster |
| ZVM recovery monitors | RecoveryOperationsBugMaster |
| ZVM recovery plan | RecoveryOperationsBugMaster |
| ZVM saas | Albert Ribakovsky |
| ZVM service infra | Idan Shama |
| ZVM site management | Miri Cohen |
| ZVM sync workflow | RansomwareBugMaster |
| ZVM vc | Moshe Taieb |
| ZVM vcd | George Khubua |
| ZVM vme | Hiro rameshlal Lalwani |
| ZVM vm journal restore | RecoveryOperationsBugMaster |
| ZVM volumes resource management | RecoveryOperationsBugMaster |
| ZVM vpg management | CoreManagementBugMaster |
| ZVM vra control | RecoveryOperationsBugMaster |
| ZVML tweak service | Roopali Gupta |

> After identifying the lead name, resolve to Jira accountId: `lookupJiraAccountId("<lead name>")`
> If the component is not in the table, search by component name directly.

---

## Step 3: Create the Jira Issue

Use `mcp_jira-mcp-serv_createJiraIssue` with `cloudId: "zerto.atlassian.net"`.

### Jira Instance Details

- **Cloud ID**: `zerto.atlassian.net` (also `4b23b31c-89fc-47d9-a2e5-3018d6a55a66`)
- **ZER Project ID**: `10039` — Bug Issue Type ID: `10004`
- **INT Project**: Use for infrastructure failures

### Required Fields (ALL must be present — missing any will cause creation failure)

| Field Name | Field ID | Type | Value |
|---|---|---|---|
| **Summary** | `summary` | String | `[Component] <Build/PR>: <Short error description>` |
| **Description** | `description` | Markdown | See template below |
| **Components** | `components` | Array | `[{"id": "<component_id>"}]` — from Step 2 |
| **Affects versions** | `versions` | Array | See Version IDs section below |
| **QA Bug Reviewer** | `customfield_10091` | Array | `[{"accountId": "<component_lead_id>"}]` — same as assignee |
| **ZVM/OS type** | `customfield_10388` | Array | `[{"id": "16482"}]` Windows / `[{"id": "16483"}]` Linux / `[{"id": "16484"}]` N/A |
| **Internal/External** | `customfield_10055` | Object | `{"id": "10062"}` Internal |
| **Regression** | `customfield_10081` | Object | `{"id": "10142"}` Yes / `{"id": "10143"}` No |
| **Severity** | `customfield_10082` | Object | See Severity IDs below |
| **Found in Build** | `customfield_10050` | Object | `{"id": "10089"}` |
| **Found in Automation** | `customfield_10051` | Object | `{"id": "10104"}` Yes / `{"id": "10105"}` No |
| **Initiative** | `customfield_10276` | Object | `{"id": "16255"}` Dev Internal |
| **To Platform** | `customfield_10347` | Array | `[{"id": "16325"}]` N/A |
| **From Platform** | `customfield_10348` | Array | `[{"id": "16321"}]` N/A |
| **Priority** | `priority` | Object | `{"name": "P1"}` for blockers |
| **Epic Link** | `customfield_10014` | String | `ZER-143309` (CI Blocker epic) |
| **Assignee** | `assignee` | Object | `{"accountId": "<component_lead_id>"}` — from Step 2 |

### Optional Rich-Text Fields (ADF format — recommended for quality)

| Field Name | Field ID | Purpose |
|---|---|---|
| **Root Cause** | `customfield_10063` | Brief one-line root cause |
| **User Impact** | `customfield_10069` | How this affects users/CI |
| **Root Cause Analysis** | `customfield_10087` | Detailed technical analysis |

**ADF Format:**
```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Your text here" }]
    }
  ]
}
```

### Severity IDs (customfield_10082)

| Severity | ID | When to Use |
|---|---|---|
| **Blocker** | `10136` | Prevents builds, blocks CI, prevents deployment |
| **Critical** | `10137` | Major functionality broken, no workaround |
| **Major** | `10138` | Significant impact, workaround exists |
| **Minor** | `10139` | Small issue, minimal impact |
| **Trivial** | `10140` | Cosmetic issues |

### ZER Component IDs

| Component | ID |
|---|---|
| ZVM vc | `10391` |
| Datapath | `10390` |
| ZVML | `10392` |
| Frontend | `10393` |
| CI/CD | `10394` |

### Version IDs (versions) — Affects Versions

**Extraction logic:**
1. Parse Jenkins job path for version (e.g. `10.9.10`, `10.8.20`, `10.11.0`)
2. Extract major.minor (`10.9`, `10.8`, `10.11`, etc.)
3. Map to ID below. If no version found, default to **N Release**

| Version | ID | Notes |
|---|---|---|
| **N Release** | `12811` | **DEFAULT** — use when version not in job path |
| 10.11 | `12812` | For 10.11.x releases |
| 10.9 | `12809` | For 10.9.x releases |
| 10.8 | `12808` | For 10.8.x releases |
| 10.7 | `12807` | For 10.7.x releases |
| 11.0 | `12810` | For 11.0.x releases |

**Job Path Examples:**
- `ZVML/zvml-build-release/10.11.0` -> Version 10.11 (ID: `12812`)
- `ZVM/release/10.9.10` -> Version 10.9 (ID: `12809`)
- `CI/Customer Insights/Saas Agent PR Checks/PR-635` -> N Release (ID: `12811`)

### Complete Bug Creation JSON Template

```json
{
  "projectKey": "ZER",
  "issueTypeName": "Bug",
  "summary": "[Component] <Build/PR>: <Short error description>",
  "description": "## Build Failure Summary\n\n**Build:** <build name and number>\n**Status:** FAILURE\n**Build URL:** <Jenkins URL>\n**Since:** <first failure timestamp>\n**Branch:** <branch name>\n\n## Root Cause\n\n<Technical error description>\n\n## Impact\n\n<What is blocked/broken>\n\n## Recommended Fix\n\n<Suggested resolution steps>",
  "contentFormat": "markdown",
  "additional_fields": {
    "assignee": {"accountId": "<component_lead_account_id>"},
    "components": [{"id": "<component_id>"}],
    "customfield_10014": "ZER-143309",
    "customfield_10050": {"id": "10089"},
    "customfield_10051": {"id": "10105"},
    "customfield_10055": {"id": "10062"},
    "customfield_10063": {
      "type": "doc", "version": 1,
      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "<brief root cause>"}]}]
    },
    "customfield_10069": {
      "type": "doc", "version": 1,
      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "<user impact>"}]}]
    },
    "customfield_10081": {"id": "10142"},
    "customfield_10082": {"id": "10136"},
    "customfield_10087": {
      "type": "doc", "version": 1,
      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "<detailed RCA>"}]}]
    },
    "customfield_10091": [{"accountId": "<component_lead_account_id>"}],
    "customfield_10276": {"id": "16255"},
    "customfield_10347": [{"id": "16325"}],
    "customfield_10348": [{"id": "16321"}],
    "customfield_10388": [{"id": "16482"}],
    "labels": ["build-failure", "ci-blocker"],
    "priority": {"name": "P1"},
    "versions": [{"id": "12811"}]
  }
}
```

---

## Step 4: Verify Creation

Query the created ticket to confirm all fields populated correctly:
```
mcp_jira-mcp-serv_getJiraIssue(
  cloudId: "zerto.atlassian.net",
  issueIdOrKey: "<ZER-XXXXX>"
)
```

---

## Step 5: Update Final Build Investigation Summary

**Mandatory** — always update the final investigation summary immediately after the Jira ticket is created.

Required updates:
- Add a prominent Jira line near the top of the summary: `Jira Ticket: [ZER-XXXXX](https://zerto.atlassian.net/browse/ZER-XXXXX)`
- In Root Cause/Action Items: state `Tracked in ZER-XXXXX`
- If the same root cause already has an existing Jira ticket, explicitly mark as duplicate and reuse the same ID — do NOT create a new ticket

Use this snippet in the final investigation summary:

```markdown
### Jira Tracking
- **Jira Ticket:** [ZER-XXXXX](https://zerto.atlassian.net/browse/ZER-XXXXX)
- **Status:** Created
- **Assigned To:** <Component Lead Name>
- **Notes:** Build failure root cause is tracked under this ticket.
```

---

## Step 6: Output for Calling Agent / Slack Notification

After the issue is created, always return:

```
JIRA_TICKET_URL: https://zerto.atlassian.net/browse/<ISSUE-KEY>
JIRA_TICKET_KEY: <ISSUE-KEY>
COMPONENT_LEAD: <displayName>
```

The calling agent uses this to post a Slack notification to `#zerto-blockers` and `#zerto-devops`,
including the ticket link and tagging the Component Lead.

---

## Common Pitfalls and Error Fixes

### "QA Bug Reviewer is needed when bug source is internal"
**Fix:** Always include `customfield_10091` when `customfield_10055` is Internal:
```json
"customfield_10091": [{"accountId": "<component_lead_account_id>"}]
```

### "ZVM/OS type required"
**Fix:** Always include:
```json
"customfield_10388": [{"id": "16482"}]
```

### "Affects versions is required"
**Fix:** Always include `versions` — extract from job path or default to N Release:
```json
"versions": [{"id": "12811"}]
```

### "Field 'components' is required"
**Fix:** Always include at least one component:
```json
"components": [{"id": "10391"}]
```

---

## Input Requirements (when triggered from CI/CD pipeline)

| Input | Source | Example |
|---|---|---|
| **PR URL** | Jenkins pipeline | `https://github.com/hpe-cds/zerto-zvm/pull/1234` |
| **Classification** | Build investigation | `code` or `infrastructure` |
| **Build URL** | Jenkins | Link to failed build |
| **Since** | Jenkins | Timestamp of first failure |
| **Branch** | Jenkins | e.g. `release/10.11.0` |

The skill resolves everything else autonomously:
- GitHub MCP -> PR description -> Jira ticket key -> component name -> component lead accountId
- Creates the blocker ticket and returns the URL + key + lead for Slack

---

## Jenkins CI Context — What to Include in Bug

When creating bugs from Jenkins failures, always capture:

1. **Build information:** URL, build number, timestamp, exit code
2. **Code context:** Repository, commit SHA, PR number, branch
3. **Error details:** Full error message, file path, line number, stack trace
4. **Environment:** Build agent, Docker image, OS/platform

**Label conventions:**
- `build-failure`, `ci-blocker`, `compilation-error`, `test-failure`
- `pr-XXX` for specific PRs
- Component tags: `zvml`, `zvm`, `saas-agent`

---

## Parent Epic Reference

- **ZER-143309** — "CI Blocker" — use for all CI/build blocking issues

---

## Field Discovery

To find field IDs for new/unknown fields:
1. `mcp_jira-mcp-serv_getJiraIssue` on a similar existing ticket (request all fields)
2. Look for `customfield_*` entries
3. Document here

**Reference ticket:** ZER-184560 — complete field mapping baseline. Query it when in doubt.

---

## Updates and Maintenance

Update this skill when:
- New required fields are added to ZER or INT project
- Field IDs change
- New components or versions are added
- QA reviewer or component lead assignments change

**Last Updated:** April 30, 2026
**Verified against:** ZER-211074 (successful creation)

## Additional Resources

- Zerto Jira: https://zerto.atlassian.net
- Jenkins: https://zbuildsrv1.zerto.local:8443
- MCP Jira tools: Use `tool_search` to load Jira MCP tools before use
