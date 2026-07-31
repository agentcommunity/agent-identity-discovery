import { execFileSync } from 'node:child_process';

export function readPythonWheelLicense(archivePath) {
  const script = [
    'import sys, zipfile',
    'archive = sys.argv[1]',
    'suffixes = (".dist-info/LICENSE", ".dist-info/licenses/LICENSE")',
    'with zipfile.ZipFile(archive) as container:',
    '    matches = [name for name in container.namelist() if name.endswith(suffixes)]',
    '    if len(matches) != 1:',
    '        raise SystemExit(f"expected exactly one supported wheel license entry, found {matches}")',
    '    sys.stdout.buffer.write(container.read(matches[0]))',
  ].join('\n');
  return execFileSync('python3', ['-c', script, archivePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
