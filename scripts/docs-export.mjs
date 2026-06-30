import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const toPosix = (value) => value.split(path.sep).join('/');

const hashBuffer = (value) => createHash('sha256').update(value).digest('hex');

const hashString = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const walkMarkdownFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkMarkdownFiles(absolutePath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(absolutePath);
    }
  }

  return files;
};

const main = async () => {
  const repoRoot = process.cwd();
  const docsRoot = path.join(repoRoot, 'packages', 'docs');
  const manifestPath = path.join(docsRoot, 'export-manifest.json');
  const checksumPath = path.join(docsRoot, 'export-manifest.sha256');

  const markdownFiles = (await walkMarkdownFiles(docsRoot))
    .map((absolutePath) => ({
      absolutePath,
      relativePath: toPosix(path.relative(docsRoot, absolutePath)),
    }))
    .sort(({ relativePath: a }, { relativePath: b }) => (a < b ? -1 : a > b ? 1 : 0))
    .map(({ absolutePath }) => absolutePath);

  const files = [];
  for (const absoluteFile of markdownFiles) {
    const contents = await fs.readFile(absoluteFile);
    files.push({
      path: toPosix(path.relative(docsRoot, absoluteFile)),
      bytes: contents.length,
      sha256: hashBuffer(contents),
    });
  }

  const aggregateInput = files.map((entry) => `${entry.path}:${entry.sha256}`).join('\n');
  const aggregateSha256 = hashString(aggregateInput);

  const manifest = {
    schemaVersion: 1,
    source: 'packages/docs',
    files,
    aggregateSha256,
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(checksumPath, `${aggregateSha256}  export-manifest.json\n`, 'utf8');

  console.log(`docs:export wrote ${files.length} docs entries`);
  console.log(`aggregate sha256: ${aggregateSha256}`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`docs:export failed: ${message}`);
  process.exit(1);
});
