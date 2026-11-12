---
version: alpha
name: BossClaw local job review
description: Chinese desktop job review with explicit approval and recoverable matching analysis.
colors:
  primary: '#0D9488'
  background: '#F5F6F8'
  surface: '#FFFFFF'
  text: '#0F172A'
typography:
  sans:
    fontFamily: '-apple-system, BlinkMacSystemFont, Inter, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif'
omitted:
  - section: spacing
    reason: Existing Ant Design component spacing remains canonical.
  - section: rounded
    reason: Existing theme.ts radii remain canonical.
---

# BossClaw local review

## North Star
Preserve the existing dense Chinese job workbench, teal actions and slate surfaces. Clear distinction between reviewing a job and sending an application is the priority. No rebrand or additional decorative styles.

## Register
Desktop product tool, zh-CN; operating-system font stack with Chinese fallbacks. Existing cards and compact actions remain.

## Runtime token ownership
`src/theme.ts` and `src/index.css` own the actual light/dark tokens, typography, spacing and global scrollbars. This document records their use; it does not generate a second token set. New dialogs use `App.useApp()` under the existing zh-CN ConfigProvider, and standard Ant Design Buttons, Alerts and Typography.

## Interaction
Shared owners and state contracts are recorded in `UX-CONTRACT.md`. A cancellation-first dialog protects approval, while match refresh is read-only with respect to delivery state. Long content scrolls inside a bounded dialog; controls remain reachable on the desktop minimum width.

## Anti-references
No browser-native confirm dialogs, silent auto-approval, hidden send on score updates, hardcoded alternate themes, or reload-driven loss of review state.
