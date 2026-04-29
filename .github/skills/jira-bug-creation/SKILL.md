---
name: jira-bug-creation
description: Create Jira bugs in Zerto projects (ZER, INT) with all required fields. Use when creating bugs for build failures, CI issues, compilation errors, or any defects in Zerto codebase. Handles complex custom field requirements for ZER project including QA reviewers, platform types, regression flags, and version tracking.
---

# Jira Bug Creation for Zerto Projects

## Overview

This skill provides the complete field mapping and requirements for creating bugs in Zerto's Jira instance (zerto.atlassian.net). It captures all mandatory and conditional fields discovered through testing to prevent creation failures.

## When to Use

- Creating bugs for CI/CD build failures
- Documenting compilation errors or test failures
- Tracking defects in ZVM, ZVML, SaaS Agent, or other Zerto components
- Creating subtasks under epics like "CI Blocker" (ZER-143309)
- Any defect tracking that requires full field population in ZER project

## Jira Instance Details

- **Cloud ID**: `zerto.atlassian.net` or `4b23b31c-89fc-47d9-a2e5-3018d6a55a66`
- **Primary Project**: ZER (Zerto) - Project ID: `10039`
- **Bug Issue Type ID**: `10004`

## ZER Project: Required Fields Reference

### Critical Fields (Always Required)

These fields MUST be included in every bug creation for ZER project:

| Field Name | Field ID | Type | Required Values |
|------------|----------|------|-----------------|
| **Affects versions** | `versions` | Array | Extract from job path or use "N Release" (see Version IDs section) |
| **QA Bug Reviewer** | `customfield_10091` | Array | `[{"accountId": "6385f8aca593cb822e968d2c"}]` (Michal Hirshoren) |
| **ZVM/OS type** | `customfield_10388` | Array | `[{"id": "16482"}]` for Windows |
| **Internal/External** | `customfield_10055` | Object | `{"id": "10062"}` for Internal |
| **Regression** | `customfield_10081` | Object | `{"id": "10142"}` for Yes, `{"id": "10143"}` for No |
| **Severity** | `customfield_10082` | Object | See severity options below |
| **Found in Build** | `customfield_10050` | Object | `{"id": "10089"}` for "1" |
| **Found in Automation** | `customfield_10051` | Object | `{"id": "10104"}` for Yes, `{"id": "10105"}` for No |
| **Initiative** | `customfield_10276` | Object | `{"id": "16255"}` for "Dev Internal" |
| **To Platform** | `customfield_10347` | Array | `[{"id": "16325"}]` for N/A |
| **From Platform** | `customfield_10348` | Array | `[{"id": "16321"}]` for N/A |
| **Components** | `components` | Array | See components section below |
| **Priority** | `priority` | Object | `{"name": "P1"}` for blocker issues |

### Optional Rich Text Fields (ADF Format)

These fields enhance bug quality but may not be strictly required:

| Field Name | Field ID | Type | Purpose |
|------------|----------|------|---------|
| **Root Cause** | `customfield_10063` | ADF Doc | Brief description of what went wrong |
| **User Impact** | `customfield_10069` | ADF Doc | How this affects users/CI/deployments |
| **Root Cause Analysis** | `customfield_10087` | ADF Doc | Detailed technical analysis |

**ADF Format Example:**
```json
{
  "content": [
    {
      "content": [
        {
          "text": "Your text here",
          "type": "text"
        }
      ],
      "type": "paragraph"
    }
  ],
  "type": "doc",
  "version": 1
}
```

## Field Value Reference

### Severity Options (customfield_10082)

| Severity | ID | When to Use |
|----------|-----|-------------|
| **Blocker** | `10136` | Prevents builds, blocks CI, prevents deployment |
| **Critical** | `10137` | Major functionality broken, no workaround |
| **Major** | `10138` | Significant impact, workaround exists |
| **Minor** | `10139` | Small issue, minimal impact |
| **Trivial** | `10140` | Cosmetic issues |

### Components (components)

| Component | ID | Description |
|-----------|-----|-------------|
| **ZVM vc** | `10391` | VC platform, API calls, Install/Uninstall/Upgrade VRA |
| **Datapath** | `10390` | Data replication paths |
| **ZVML** | `10392` | ZVM Linux components |
| **Frontend** | `10393` | UI/UX components |
| **CI/CD** | `10394` | Build and deployment infrastructure |

### Version IDs (versions)

**Version Extraction Logic:**
1. Parse Jenkins job path for version pattern (e.g., "10.9.10", "10.8.20")
2. Extract major.minor version (10.9, 10.8, etc.)
3. Map to version ID below
4. If no version found in path, use "N Release" as default

| Version | ID | Notes |
|---------|-----|-------|
| **N Release** | `12811` | **DEFAULT** - Use when version not in job path |
| 10.9 | `12809` | For 10.9.x releases |
| 10.8 | `12808` | For 10.8.x releases |
| 10.7 | `12807` | For 10.7.x releases |
| 11.0 | `12810` | For 11.0.x releases |

**Job Path Examples:**
- `ZVM/release/10.9.10` → Version 10.9 (ID: 12809)
- `ZVML 10.8.20` → Version 10.8 (ID: 12808)
- `CI/Customer Insights/Saas Agent PR Checks/PR-635` → N Release (ID: 12811)

### Platform Types (customfield_10388)

| Platform | ID |
|----------|-----|
| **Windows** | `16482` |
| **Linux** | `16483` |
| **N/A** | `16484` |

### QA Bug Reviewers (customfield_10091)

| Reviewer | Account ID |
|----------|------------|
| **Michal Hirshoren** | `6385f8aca593cb822e968d2c` |
| **Auto-assign** | Use Michal as default reviewer |

## Complete Bug Creation Template

### For CI/Build Failures

```json
{
  "projectKey": "ZER",
  "issueTypeName": "Bug",
  "summary": "[Component] PR #XXX: Error description",
  "description": "## Build Failure Summary\n\n**Build:** [Build name and number]\n**Status:** FAILURE\n**Build URL:** [Jenkins URL]\n\n## Root Cause\n\n[Technical error description]\n\n## Impact\n\n[What is blocked/broken]\n\n## Recommended Fix\n\n[Suggested resolution steps]",
  "contentFormat": "markdown",
  "additional_fields": {
    "components": [{"id": "10391"}],
    "customfield_10050": {"id": "10089"},
    "customfield_10051": {"id": "10105"},
    "customfield_10055": {"id": "10062"},
    "customfield_10063": {
      "content": [{"content": [{"text": "Brief root cause", "type": "text"}], "type": "paragraph"}],
      "type": "doc",
      "version": 1
    },
    "customfield_10069": {
      "content": [{"content": [{"text": "User impact description", "type": "text"}], "type": "paragraph"}],
      "type": "doc",
      "version": 1
    },
    "customfield_10081": {"id": "10142"},
    "customfield_10082": {"id": "10136"},
    "customfield_10087": {
      "content": [{"content": [{"text": "Detailed RCA", "type": "text"}], "type": "paragraph"}],
      "type": "doc",
      "version": 1
    },
    "customfield_10091": [{"accountId": "6385f8aca593cb822e968d2c"}],
    "customfield_10276": {"id": "16255"},
    "customfield_10347": [{"id": "16325"}],
    "customfield_10348": [{"id": "16321"}],
    "customfield_10388": [{"id": "16482"}],
    "labels": ["build-failure", "ci-blocker"],
    "parent": {"key": "ZER-143309"},
    "priority": {"name": "P1"},
    "versions": [{"id": "12811"}]  // Default to N Release; extract from job path if available
  }
}
```

## Common Pitfalls & Error Messages

### "QA Bug Reviewer is needed when bug source is internal"

**Cause:** Missing `customfield_10091` field when `customfield_10055` is set to Internal (id: 10062)

**Fix:** Always include QA Bug Reviewer when creating internal bugs:
```json
"customfield_10091": [{"accountId": "6385f8aca593cb822e968d2c"}]
```

### "ZVM/OS type required"

**Cause:** Missing `customfield_10388` field

**Fix:** Always specify platform type:
```json
"customfield_10388": [{"id": "16482"}]  // Windows
```

### "Affects versions is required"

**Cause:** Missing `versions` field

**Fix:** Always specify affected version (extract from job path or default to N Release):
```json
"versions": [{"id": "12811"}]  // N Release (default)
"versions": [{"id": "12809"}]  // 10.9 (if found in job path)
```

### "Field 'components' is required"

**Cause:** Missing or empty `components` field

**Fix:** Always specify at least one component:
```json
"components": [{"id": "10391"}]  // ZVM vc
```

## Integration with CI Systems

### From Jenkins Build Failures

When creating bugs from Jenkins failures, include:

1. **Build Information:**
   - Build URL (full Jenkins link)
   - Build number
   - Timestamp
   - Exit code/status

2. **Code Context:**
   - Repository name
   - Commit SHA
   - PR number (if applicable)
   - Branch name

3. **Error Details:**
   - Full error message
   - File path and line number
   - Stack trace (if applicable)

4. **Environment:**
   - Build agent name
   - Docker image (if applicable)
   - OS/platform details

### Label Conventions

Use descriptive labels to categorize issues:

- `build-failure` - CI build issues
- `compilation-error` - Code compilation problems
- `test-failure` - Unit/integration test failures
- `ci-blocker` - Blocks continuous integration
- `pr-XXX` - Reference specific PR number
- Component names: `zvml`, `zvm`, `saas-agent`, etc.

## Parent Epic Reference

Common parent epics for CI/build issues:

- **ZER-143309**: "CI Blocker" - Use for any CI/build blocking issues
- Check with team for active epic assignments

## Field Discovery Process

If you need to find field IDs for new fields:

1. Use `mcp_jira-mcp-serv_getJiraIssue` on a similar existing ticket
2. Request all fields to see complete field mapping
3. Look for `customfield_*` entries in the response
4. Document new field IDs in this skill file

## Reference Ticket Example

**ZER-184560** contains a complete field mapping that was used as reference for this skill. When in doubt, query this ticket to see all field values:

```
mcp_jira-mcp-serv_getJiraIssue(
  cloudId: "zerto.atlassian.net",
  issueIdOrKey: "ZER-184560"
)
```

## Best Practices

1. **Always use markdown for description** - Set `contentFormat: "markdown"` for better formatting
2. **Include build URLs** - Direct links help developers investigate quickly
3. **Add relevant labels** - Makes bugs searchable and categorizable
4. **Link to parent epic** - Keeps work organized under initiatives
5. **Set appropriate priority** - P1 for blockers, P2 for critical, P3 for normal
6. **Fill optional fields** - Root Cause Analysis and User Impact improve bug quality
7. **Use consistent naming** - Format: "[Component] PR #XXX: Error description"

## Workflow Integration

### Step 1: Gather Information
- Build URL and status
- **Extract version from job path** (e.g., "10.9" from "ZVM/release/10.9.10")
- Error messages and logs
- Commit SHA and repository
- Affected component/system

### Step 2: Determine Severity
- Blocker: Breaks CI, prevents merges
- Critical: Major functionality broken
- Major: Significant issue with workaround
- Minor: Small impact

### Step 3: Create Bug
Use the template above with actual values

### Step 4: Verify Creation
Query the created ticket to confirm all fields populated correctly

### Step 5: Update Final Build Investigation Summary
After Jira bug creation succeeds, always update the final investigation summary to include the new Jira ID.

Required updates in the final summary:
- Add a prominent Jira line near the top: `Jira Ticket: ZER-XXXXX`
- Include the full Jira URL: `https://zerto.atlassian.net/browse/ZER-XXXXX`
- In Root Cause/Action Items, state: `Tracked in ZER-XXXXX`
- If the same root cause already exists, explicitly mark it as duplicate and reuse the same Jira ID

Use this snippet in the final investigation summary:

```markdown
### Jira Tracking
- Jira Ticket: [ZER-XXXXX](https://zerto.atlassian.net/browse/ZER-XXXXX)
- Status: Created
- Notes: Build failure root cause is tracked under this ticket.
```

## Updates & Maintenance

This skill should be updated when:
- New required fields are added to ZER project
- Field IDs change (rare but possible)
- New components or versions are added
- QA reviewer assignments change
- Field validation rules change

**Last Updated:** April 29, 2026
**Based on:** Successful creation of ZER-211074

## Additional Resources

- Zerto Jira: https://zerto.atlassian.net
- Jenkins: https://zbuildsrv1.zerto.local:8443
- MCP Jira Server: Use `tool_search` to find Jira MCP tools before use
