import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function copyPackageWorkspace({ checkout, temporaryRoot, packageNames }) {
  const temporaryPackages = join(temporaryRoot, 'packages');
  mkdirSync(temporaryPackages, { recursive: true });
  for (const packageName of packageNames) {
    const source = join(checkout, 'packages', packageName);
    const destination = join(temporaryPackages, packageName);
    cpSync(source, destination, {
      recursive: true,
      verbatimSymlinks: true,
      filter(path) {
        return path !== join(source, 'dist');
      },
    });
  }
  return temporaryPackages;
}
