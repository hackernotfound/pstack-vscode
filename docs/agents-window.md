# Set up VS Code's agents window

pstack works in VS Code's agents window as soon as it's installed. This page is optional. It makes the window work more like [T3 Code](https://t3.codes), so you can see and open the subagents pstack starts. Each step is a VS Code setting, so you do it once.

Open **Preferences: Open User Settings (JSON)** for the settings below.

## If you want to see your subagents while they run

1. Start any chat that uses a subagent.
2. Right-click the row of pills just above the chat input, or click **Configure Session Status Pills**, and tick **Subagents**. VS Code hides this pill by default.
3. Right-click the new **Subagents** pill and choose **Show In Progress**, so the list only shows subagents that are still working.

Click a subagent in that list to open its conversation in a tab.

## If you want a subagent side by side with the main chat

Click the subagent's card in the chat, the line that shows its name, model, and run time. It opens in a pane next to the main chat. Each card you click adds another pane.

## If you want chats in tabs

```json
"sessions.showChatTabs": "multiple"
```

## If you want to see what each subagent cost

```json
"chat.subagents.showCreditUsage": true
```

The cost then shows on each subagent's card, such as `0.1 credits`.

## If you want subagents to start their own subagents

```json
"chat.subagents.allowInvocationsFromSubagents": true
```

pstack's larger workflows, such as `swarm` and `arena`, use this.

## If you want to hide sessions from other tools

```json
"chat.agentSessions.showExternal": "none"
```

This hides the **External** section, which lists sessions started outside the agents window, for example in Copilot CLI.

## If you want the agent's commands sandboxed

```json
"chat.agent.sandbox.enabled": "on"
```

A shield appears next to the permissions picker. Ordinary commands, such as reading files or listing folders, keep working.

## Everything at once

```json
"sessions.showChatTabs": "multiple",
"chat.subagents.showCreditUsage": true,
"chat.subagents.allowInvocationsFromSubagents": true,
"chat.agentSessions.showExternal": "none",
"chat.agent.sandbox.enabled": "on"
```

Then turn on the Subagents pill as described above. That last step lives in VS Code's interface, not in settings.

Tested with VS Code 1.140.0. Most of these settings are marked experimental or preview in VS Code, so their names can change in later versions.
