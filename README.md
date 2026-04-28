# openclaw-ftal

Multi-dimensional reply quality scoring for OpenClaw agents.

**F**aithfulness / **T**ruthfulness / **A**ccuracy / **L**atency (advisory)

```
openclaw plugins install openclaw-ftal
```

---

## What it does

Scores each agent reply against a rubric. When a reply scores below the gap threshold, it can inject teaching context into the next prompt turn or — on newer OpenClaw builds — block delivery and request a revision before the reply reaches the user.

---

## OpenClaw version compatibility

The plugin has two operating modes depending on your OpenClaw version:

| OpenClaw version | Behavior |
|---|---|
| Any `>= 2026.4.0` | **v1 path**: scores via `agent_end`, injects teaching context on the next turn via `before_prompt_build`. No retry gating. |
| `>= commit f3accc753c` (#71765) | **v2 path** (opt-in): scores via `before_agent_finalize`, blocks delivery and requests model revision before the reply reaches the user. |

If you're on an older build and `retryEnabled: true` is set, scoring and teaching still work — **the retry gating just won't fire**. You won't get errors; the plugin silently falls back to the v1 path. The most common "why doesn't retry fire?" cause is running an OpenClaw build that predates `before_agent_finalize`.

---

## Configuration

```json
{
  "plugins": {
    "entries": {
      "openclaw-ftal": {
        "config": {
          "rubric": "coding-ftal-v1",
          "retryEnabled": false,
          "useFinalize": false,
          "maxRevisions": 3
        }
      }
    }
  }
}
```

| Field | Default | Description |
|---|---|---|
| `rubric` | `coding-ftal-v1` | Rubric to use. Built-ins: `coding-ftal-v1`, `concise-v1`. |
| `retryEnabled` | `false` | Enable retry/teaching injection on failed scores. |
| `useFinalize` | `false` | Enable `before_agent_finalize` gating (v2 path, requires newer OpenClaw + `allowConversationAccess: true`). |
| `maxRevisions` | `3` | Maximum revision attempts per turn before forcing delivery. |
| `gapThreshold` | rubric default | Override the rubric's gap threshold (0–100). |

### Enabling v2 gating

Set `useFinalize: true` and grant `allowConversationAccess` (an operator-level setting, not something the plugin can grant itself):

```json
{
  "plugins": {
    "entries": {
      "openclaw-ftal": {
        "hooks": { "allowConversationAccess": true },
        "config": {
          "retryEnabled": true,
          "useFinalize": true,
          "maxRevisions": 3
        }
      }
    }
  }
}
```

---

## Built-in rubrics

**`coding-ftal-v1`** (default) — four dimensions for coding-heavy tasks:

| Dim | Weight | Notes |
|---|---|---|
| F — Faithfulness | 40 | Reply grounded in provided/retrieved context |
| T — Truthfulness | 40 | No fabricated API names, facts, or signatures |
| A — Accuracy | 10 | Output satisfies the stated task |
| L — Latency | 10 | Advisory only — never gates revisions |

L is marked advisory: a bad latency score is reported in telemetry but never triggers a revision request, because retrying necessarily makes latency worse.

**`concise-v1`** — two dimensions for short-form/conversational replies (completeness 60, directness 40).

---

## Inter-plugin API

Other plugins can read FTAL scores via the exported store:

```typescript
import { FtalStore } from "openclaw-ftal/store";

const record = FtalStore.getLatest(sessionKey);
// { rubric, dimensions, gap, passed, confidence, scoredAt, ... }

// After independent verification, flip confidence:
FtalStore.updateConfidence(sessionKey, runId, "verified", ["mem-id-1"]);
```

`FtalStore` is **same-process / non-durable / best-effort**. Records are evicted after 1 hour or when `deleteByRun()` is called. It stores compact score metadata only — no raw reply text.

---

## Source

`github.com/mvogt99/openclaw-ftal` · MIT
