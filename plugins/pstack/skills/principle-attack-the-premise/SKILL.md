---
name: principle-attack-the-premise
description: "Apply when repeated fixes sharing an assumption fail. State the assumption and choose an observation that can challenge it before trying another fix that depends on it."
user-invocable: false
---

# Attack the premise

When two or more fixes sharing an assumption fail the same gate, write down what they assumed. Before another fix depends on it, choose an observation or experiment that can challenge it.

Match the experiment to the hypothesis. Two timeout increases may assume requests reach the intended destination. Check the actual destination before increasing the timeout again.

When the hypothesis concerns uneven allocation, ownership, or assignment, count resources or work per actor. Measure the distribution and trace the assignment per Fix Root Causes (see `skills/principle-fix-root-causes/SKILL.md` in this plugin). Recommend redistribution, rotation, or reassignment only when evidence connects that assignment to the failure. An even distribution weakens the imbalance hypothesis; it does not rule out a shared defect. Every worker can leak at the same rate.

Keep a rerunnable experiment when useful, per Build the Lever (see `skills/principle-build-the-lever/SKILL.md` in this plugin). Do not turn this into a mandatory census for unrelated bugs.

This principle questions an assumption about the existing system. Redesign from First Principles (see `skills/principle-redesign-from-first-principles/SKILL.md` in this plugin) rebuilds a design around a new requirement.
