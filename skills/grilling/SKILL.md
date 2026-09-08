---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Each question should be formatted like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it — don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report — ask the rest of the frontier now. The _decisions_ are the user's — put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

---

## DSH note: asking the user

This skill runs in DeepSeek Harness (DSH). Whenever it says to ask the user, for a confirmation, a choice, or missing information, ask with the **`ask_user_question` tool**, not in chat prose. Put the questions that can go together into one call. Each question needs a stable `id` and a `question`, plus a short `header`. Attach `options` when a choice exists: the recommended choice first, `(Recommended)` appended to its label. Set `multi_select: true` only when several options can be true at once. No `options` means the user answers free-form.

If the skill writes its questions in the `❓ **Q1**` / `➡️ recommended answer` format, map that format onto the tool: the title and body go in `question`, the recommended answer becomes the first option labeled `(Recommended)`, and a question with no natural choices stays option-free.

A delegated subagent cannot call `ask_user_question`. The call is rejected with `DELEGATED_CALLER`. If this skill runs inside a subagent, return the questions in the subagent's final result, and let the parent session ask them.
