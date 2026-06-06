# Security boundaries

## What this service must never do

- **Must not spend money.** No payment processing, no billing API calls, no resource provisioning with cost.
- **Must not enter credit cards.** No payment form interaction, no stored payment methods.
- **Must not deploy.** No deployment triggers, no CI/CD pipeline execution, no infrastructure provisioning.
- **Must not push code.** No git push, no PR creation, no branch management in production repos.
- **Must not access secrets directly.** No reading of environment variables, vault entries, or credential stores.
- **Must not make network requests to external services** beyond its own dependencies (SQLite is local).

## What this service may do

- Recommend actions based on memory and context
- Validate action schemas and parameters
- Record traces and session events
- Extract candidate memories from text
- Classify tasks by intent, type, and risk
- Match actions against policy rules
- Return structured allow/deny/approval-required decisions
- Serve mock platform responses for testing

## Enforcement

In production, enforcement is the responsibility of the future platform:

- **Policy enforcement:** The platform applies its own policy rules before executing any action. agent-core's policy endpoints are advisory only.
- **Quota enforcement:** The platform tracks and enforces resource quotas (API calls, compute time, storage). agent-core has no quota awareness.
- **Approval gates:** The platform manages the approval workflow (request, review, approve/deny). agent-core can flag that an action requires approval, but it cannot grant approval.
- **Audit logging:** The platform maintains its own audit log in addition to agent-core's trace store. The platform's audit log is the authoritative record.
- **Network isolation:** In production, agent-core should run in a restricted network segment with no outbound internet access. It should only be reachable by the platform's internal services.

## Mock boundaries in phase 1

The mock platform endpoints (`/mock-platform/*`) simulate these enforcement boundaries. They return realistic responses but perform no real enforcement. They exist so that the memory/action/rules flow can be tested end-to-end before the real platform is built.
