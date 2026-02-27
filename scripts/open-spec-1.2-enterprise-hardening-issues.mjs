#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PLAN_FILE = 'tracking/SPEC_1.2_ENTERPRISE_HARDENING_ISSUES.md';
const DEFAULT_REPO = 'agentcommunity/agent-identity-discovery';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const repoArgIndex = process.argv.indexOf('--repo');
const repo =
  repoArgIndex > -1 && process.argv[repoArgIndex + 1]
    ? process.argv[repoArgIndex + 1]
    : process.env.GITHUB_REPOSITORY || DEFAULT_REPO;

function runGh(ghArgs, input) {
  const result = spawnSync('gh', ghArgs, {
    encoding: 'utf8',
    input,
  });
  if (result.status !== 0) {
    const cmd = `gh ${ghArgs.join(' ')}`;
    const stderr = result.stderr?.trim();
    throw new Error(`${cmd} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return result.stdout.trim();
}

function runGhJson(ghArgs) {
  const output = runGh(ghArgs);
  return output ? JSON.parse(output) : [];
}

function parseIssueSections(markdown) {
  const sections = [];
  const headerRegex = /^### ISSUE (\d+)(?:\s+\(([^)]+)\))?/gm;
  const matches = [...markdown.matchAll(headerRegex)];

  for (const [index, match] of matches.entries()) {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length;
    const sectionText = markdown.slice(start, end);
    const number = Number.parseInt(match[1], 10);
    const tracker = (match[2] || '').toLowerCase().includes('tracker');

    const titleMatch = sectionText.match(/Title:\s*\n`([^`]+)`/);
    const githubIssueMatch = sectionText.match(/GitHub issue:\s*\n`#(\d+)`/);
    const bodyMatch = sectionText.match(/Body:\s*\n```md\n([\s\S]*?)\n```/);
    const labelsSectionMatch = sectionText.match(
      /Labels:\s*\n([\s\S]*?)(?:\n\n(?:GitHub issue:|Controversy level:|Body:|---|## ISSUE|$))/,
    );
    const labelMatches = labelsSectionMatch
      ? [...labelsSectionMatch[1].matchAll(/^\s*-\s*`([^`]+)`\s*$/gm)]
      : [];

    if (!titleMatch || !bodyMatch) {
      throw new Error(`Unable to parse ISSUE ${number} from ${PLAN_FILE}.`);
    }

    sections.push({
      number,
      tracker,
      title: titleMatch[1].trim(),
      githubIssueNumber: githubIssueMatch ? Number.parseInt(githubIssueMatch[1], 10) : null,
      body: bodyMatch[1].trim(),
      labels: labelMatches.map((labelMatch) => labelMatch[1].trim()),
    });
  }

  return sections.sort((a, b) => a.number - b.number);
}

function parseIssueNumber(issueUrl) {
  const match = issueUrl.match(/\/issues\/(\d+)\s*$/);
  if (!match) {
    throw new Error(`Could not parse issue number from URL: ${issueUrl}`);
  }
  return Number.parseInt(match[1], 10);
}

function labelColor(name) {
  const colors = {
    spec: '0052CC',
    enterprise: '5319E7',
    tracking: 'FBCA04',
    discovery: '1D76DB',
    security: 'D93F0B',
    conformance: '0E8A16',
    'sdk-parity': '1D76DB',
    parser: 'BFD4F2',
    format: 'A2EEEF',
    tooling: 'F9D0C4',
  };
  return colors[name] || '1F6FEB';
}

function ensureLabels(specs) {
  const required = new Set(specs.flatMap((spec) => spec.labels));
  const existing = new Set(
    runGhJson(['label', 'list', '--repo', repo, '--limit', '500', '--json', 'name']).map((label) => label.name),
  );

  for (const label of required) {
    if (existing.has(label)) continue;
    if (!apply) continue;
    runGh([
      'label',
      'create',
      label,
      '--repo',
      repo,
      '--color',
      labelColor(label),
      '--description',
      `Label used by ${PLAN_FILE}`,
    ]);
    existing.add(label);
  }

  return existing;
}

function createIssue(spec, availableLabels, bodyOverride) {
  const body = bodyOverride ?? spec.body;
  const cmd = ['issue', 'create', '--repo', repo, '--title', spec.title, '--body-file', '-'];
  for (const label of spec.labels.filter((value) => availableLabels.has(value))) {
    cmd.push('--label', label);
  }

  if (!apply) {
    return {
      title: spec.title,
      number: null,
      url: '(dry-run)',
      created: false,
      simulated: true,
    };
  }

  const url = runGh(cmd, body);
  return {
    title: spec.title,
    number: parseIssueNumber(url),
    url,
    created: true,
    simulated: false,
  };
}

function editIssue(spec, availableLabels, issueNumber, bodyOverride) {
  const body = bodyOverride ?? spec.body;
  if (!apply) {
    return {
      title: spec.title,
      number: issueNumber,
      url: `(dry-run existing #${issueNumber})`,
      created: false,
      updated: true,
      simulated: true,
    };
  }

  const cmd = [
    'issue',
    'edit',
    String(issueNumber),
    '--repo',
    repo,
    '--title',
    spec.title,
    '--body-file',
    '-',
  ];
  for (const label of spec.labels.filter((value) => availableLabels.has(value))) {
    cmd.push('--add-label', label);
  }

  runGh(cmd, body);
  return {
    title: spec.title,
    number: issueNumber,
    url: `https://github.com/${repo}/issues/${issueNumber}`,
    created: false,
    updated: true,
    simulated: false,
  };
}

function main() {
  const planPath = path.resolve(process.cwd(), PLAN_FILE);
  const markdown = fs.readFileSync(planPath, 'utf8');
  const specs = parseIssueSections(markdown);
  const tracker = specs.find((spec) => spec.tracker || spec.number === 0);
  const children = specs.filter((spec) => spec !== tracker);

  if (!tracker) {
    throw new Error(`No tracker issue found in ${PLAN_FILE}.`);
  }

  const availableLabels = ensureLabels(specs);
  const existingIssues = runGhJson([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--limit',
    '500',
    '--json',
    'number,title,url',
  ]);
  const existingByTitle = new Map(existingIssues.map((issue) => [issue.title, issue]));
  const existingByNumber = new Map(existingIssues.map((issue) => [issue.number, issue]));

  const childResults = [];
  for (const child of children) {
    if (child.githubIssueNumber) {
      const existing = existingByNumber.get(child.githubIssueNumber);
      if (!existing) {
        throw new Error(
          `Mapped GitHub issue #${child.githubIssueNumber} for "${child.title}" was not found in ${repo}.`,
        );
      }

      const edited = editIssue(child, availableLabels, child.githubIssueNumber);
      childResults.push(edited);
      existingByTitle.set(child.title, {
        number: child.githubIssueNumber,
        title: child.title,
        url: `https://github.com/${repo}/issues/${child.githubIssueNumber}`,
      });
      continue;
    }

    const existing = existingByTitle.get(child.title);
    if (existing) {
      childResults.push({
        title: child.title,
        number: existing.number,
        url: existing.url,
        created: false,
        updated: false,
        simulated: false,
      });
      continue;
    }

    const created = createIssue(child, availableLabels);
    if (created.number) {
      existingByTitle.set(child.title, created);
    }
    childResults.push(created);
  }

  let placeholderIndex = 0;
  const trackerBody = tracker.body.replace(/#TBD/g, () => {
    const child = childResults[placeholderIndex];
    placeholderIndex += 1;
    if (!child) return '#TBD';
    if (!child.number) return `#ISSUE_${placeholderIndex}`;
    return `#${child.number}`;
  });

  let trackerResult;
  if (tracker.githubIssueNumber) {
    const existing = existingByNumber.get(tracker.githubIssueNumber);
    if (!existing) {
      throw new Error(
        `Mapped GitHub issue #${tracker.githubIssueNumber} for tracker "${tracker.title}" was not found in ${repo}.`,
      );
    }
    trackerResult = editIssue(tracker, availableLabels, tracker.githubIssueNumber, trackerBody);
  } else {
    const existingTracker = existingByTitle.get(tracker.title);
    trackerResult = existingTracker
      ? {
          title: tracker.title,
          number: existingTracker.number,
          url: existingTracker.url,
          created: false,
          updated: false,
          simulated: false,
        }
      : createIssue(tracker, availableLabels, trackerBody);
  }

  console.log(`Repo: ${repo}`);
  console.log(`Plan: ${PLAN_FILE}`);
  console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
  console.log('');
  console.log('Child issues:');
  for (const issue of childResults) {
    const status = issue.created
      ? 'created'
      : issue.updated
        ? issue.simulated
          ? 'would update'
          : 'updated'
        : issue.simulated
          ? 'would create'
          : 'existing';
    console.log(`- [${status}] ${issue.title} -> ${issue.url}`);
  }
  console.log('');
  {
    const status = trackerResult.created
      ? 'created'
      : trackerResult.updated
        ? trackerResult.simulated
          ? 'would update'
          : 'updated'
      : trackerResult.simulated
        ? 'would create'
        : 'existing';
    console.log(`Tracker: [${status}] ${trackerResult.title} -> ${trackerResult.url}`);
  }
}

main();
