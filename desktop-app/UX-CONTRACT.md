# Local job review contract

Scope: Workbench and Tasks job approval, duplicate detail refresh and match reanalysis. Existing unrelated product flows retain upstream behavior.

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
