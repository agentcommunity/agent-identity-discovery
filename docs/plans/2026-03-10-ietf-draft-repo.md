# IETF Draft Repo Setup - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up a standalone IETF I-D repo using martinthomson/i-d-template for `draft-nemethi-aid-agent-identity-discovery`, move the XML out of the AID monorepo, and clean up tracking/iana.

**Architecture:** New repo at `../draft-nemethi-aid-agent-identity-discovery/` using i-d-template's standard layout. XML source at repo root with `-latest` docName convention. GitHub Actions will auto-build editor's copy on push. Repo starts private, goes public on submission day.

**Tech Stack:** i-d-template, xml2rfc, GitHub Actions, GitHub Pages

---

### Task 1: Create the new repo directory and copy XML

**Files:**
- Create: `../draft-nemethi-aid-agent-identity-discovery/draft-nemethi-aid-agent-identity-discovery.xml`

**Step 1:** Initialize the repo

```bash
cd /Users/user/dev/PROJECTS/AgentCommunity
mkdir draft-nemethi-aid-agent-identity-discovery
cd draft-nemethi-aid-agent-identity-discovery
git init
git checkout --orphan main
```

**Step 2:** Copy and adapt the XML

Copy `AID/tracking/iana/draft-nemethi-aid-agent-identity-discovery-00.xml` to the new repo root as `draft-nemethi-aid-agent-identity-discovery.xml`.

Change `docName` from `draft-nemethi-aid-agent-identity-discovery-00` to `draft-nemethi-aid-agent-identity-discovery-latest` (i-d-template convention — the tool auto-generates version numbers).

Change `seriesInfo value` from `draft-nemethi-aid-agent-identity-discovery-00` to `draft-nemethi-aid-agent-identity-discovery-latest`.

**Step 3:** Commit

```bash
git add draft-nemethi-aid-agent-identity-discovery.xml
git commit -m "Initial draft: Agent Identity and Discovery (AID)"
```

---

### Task 2: Install i-d-template and run setup

**Step 1:** Clone i-d-template as lib/

```bash
git clone --depth 10 -b main https://github.com/martinthomson/i-d-template lib
```

**Step 2:** Run setup

```bash
make -f lib/setup.mk setup-default-branch
```

(Using `setup-default-branch` because we don't have a remote yet — skips gh-pages push.)

**Step 3:** Verify build works

```bash
make
```

Expected: generates `draft-nemethi-aid-agent-identity-discovery.txt` and `.html`

**Step 4:** Commit setup artifacts

```bash
git add -A
git commit -m "chore: add i-d-template scaffolding"
```

---

### Task 3: Add .gitignore

**Files:**
- Create: `../draft-nemethi-aid-agent-identity-discovery/.gitignore`

Standard i-d-template gitignore (setup.mk may create this, verify first).

---

### Task 4: Clean up AID monorepo tracking/iana

**In the AID monorepo (`/Users/user/dev/PROJECTS/AgentCommunity/AID`):**

**Step 1:** Delete files

- `tracking/iana/draft-nemethi-aid-agent-identity-discovery-00.xml` (moved)
- `tracking/iana/SPEC_IANA_GAP_ANALYSIS.md` (completed)
- `tracking/iana/INTEROP_NOTE_AID_ARDP.md` (no longer needed)
- `tracking/iana/TODO_SINGLE_SOURCE_WORKFLOW.md` (solved by repo move)

**Step 2:** Gitignore private operational files

Add to `tracking/iana/.gitignore`:
```
IANA_AGENT_PLAN.md
EMAILS_READY_TO_SEND.md
GITHUB_ISSUE_RESPONSE_DRAFT.md
```

**Step 3:** Keep tracked (public)

- `EVIDENCE_ANNEX.md` — reviewer evidence
- `AID_DEVELOPMENT_TIMELINE.md` — supporting history
- `IANA-ICANN-Research-Report.md` — public research
- `AGENTS.md` — agent instructions

**Step 4:** Add pointer file

Create `tracking/iana/DRAFT_REPO.md` pointing to the new repo location.

**Step 5:** Commit

```bash
git add -A
git commit -m "chore(iana): move I-D to dedicated repo, clean up tracking files"
```
