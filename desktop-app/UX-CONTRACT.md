# Local job review contract

Scope: Workbench and Tasks job approval, duplicate detail refresh and match reanalysis. Automatic send entry points also require explicit confirmation.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Dialog | `src/components/job-review/JobApproval.tsx` | User review request | single / pending batch | isolated desktop UI: cancel, Escape, success, stale state |
| Toast | Ant Design `App.useApp()` | ConfigProvider zh-CN | success / warning | localized feedback |
| CRUD | `useDataStore` | file-backed queue | metadata update / score update | queue roundtrip and state-preservation regression |
| Async analysis | `useMatchAnalysisStore` | current resume, profile, job and model | single / all pending | failure, stop, stale input, duplicate-start regression |
| Scrollbar | `src/index.css` | runtime tokens | dialog inner overflow | desktop/narrow dialog inspection |

Approval opens a dialog showing the exact jobs and greeting, defaults focus to Cancel, and does not mutate anything until confirmation. Confirmation revalidates the current job, greeting, score and status, then changes pending to approved (待投递), never approved_queue. Sending needs a separate explicit action. Other statuses cannot bypass pending review.

Reanalysis requires a configured model, never uses the acquisition dedup filter, bypasses old scoring cache, preserves status and greeting, and retains five previous analyses. Failure retains old score with visible cause. Serial work prevents request bursts. Stop discards the current response and leaves later jobs untouched. A shared store survives navigation; only pending jobs are eligible. Changed/deleted jobs or changed inputs invalidate responses. Three consecutive failures stop the batch. API credentials never enter persisted analysis metadata.

Manual duplicate addition updates non-empty detail fields without a duplicate card or silent model request. It marks changed material for explicit reanalysis. Normal search dedup remains enabled and is not a rescore mechanism. Existing filters and list positions stay under their current page owners.

Pending Workbench cards keep all five actions on one compact row (12px text, 26px height). Single-job refresh displays “分析”; the tooltip and accessible name retain the full operation name.

All approval entry points (including Home bulk approval) only enter the non-executing approved state. Starting delivery from Home, Workbench, Tasks or either browser surface requires a cancellation-first dialog. AutoChat batch, single-send and AI follow-up switches require their own sending warning. No running engine flags survive an application restart, including legacy saved flags. Execution mode resets to manual review and enabling auto mode also requires confirmation. AutoChat consumes only the batch present at confirmation and ends when complete; jobs approved while running wait for another explicit start. Scheduled delivery only reminds the user to review and start manually. Remote-control send/start shortcuts cannot bypass the dialogs; remote stop remains available.

Upstream daily update checks only fetch public release metadata. The notification identifies this as a local customized build, directs upgrades through Git integration, and never downloads or installs an upstream binary automatically.
