import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { copyPackageWorkspace } from './package-claim-workspace.mjs';

test('copied workspace dependencies resolve only inside the temporary workspace', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'aid-package-workspace-fixture-'));
  const checkout = join(fixtureRoot, 'checkout');
  const temporaryRoot = join(fixtureRoot, 'temporary');
  const packageNames = ['aid', 'aid-engine', 'aid-doctor'];
  try {
    for (const packageName of packageNames) {
      mkdirSync(join(checkout, 'packages', packageName, 'node_modules', '@agentcommunity'), { recursive: true });
      writeFileSync(join(checkout, 'packages', packageName, 'package.json'), JSON.stringify({ name: packageName }));
    }
    mkdirSync(join(checkout, 'packages', 'aid', 'dist'), { recursive: true });
    writeFileSync(join(checkout, 'packages', 'aid', 'dist', 'stale.js'), 'throw new Error("checkout dist consumed");\n');
    symlinkSync('../../../aid', join(checkout, 'packages', 'aid-engine', 'node_modules', '@agentcommunity', 'aid'));
    symlinkSync('../../../aid', join(checkout, 'packages', 'aid-doctor', 'node_modules', '@agentcommunity', 'aid'));
    symlinkSync('../../../aid-engine', join(checkout, 'packages', 'aid-doctor', 'node_modules', '@agentcommunity', 'aid-engine'));

    const temporaryPackages = copyPackageWorkspace({ checkout, temporaryRoot, packageNames });
    const canonicalCheckout = realpathSync(checkout);
    for (const [packageName, dependencyName] of [
      ['aid-engine', 'aid'],
      ['aid-doctor', 'aid'],
      ['aid-doctor', 'aid-engine'],
    ]) {
      const resolved = realpathSync(join(temporaryPackages, packageName, 'node_modules', '@agentcommunity', dependencyName));
      assert.equal(resolved, realpathSync(join(temporaryPackages, dependencyName)));
      assert.equal(resolved.startsWith(canonicalCheckout), false);
    }
    assert.equal(existsSync(join(temporaryPackages, 'aid', 'dist')), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
