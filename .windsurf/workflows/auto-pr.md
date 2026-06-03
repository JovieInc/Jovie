---
description: Pulls an issue from Linea, runs autoplan, qa, review, and ship, then creates a PR
---
Autonomously pull one unassigned Linear issue from "Design Work", mark in-progress, run /autoplan → /qa --exhaustive → /review → /ship, update Linear with status and PR link, ensure long-running execution, full permissions, and prevent other agents from handling the same issue.