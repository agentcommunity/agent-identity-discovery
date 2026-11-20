import { runModelMarketInterop } from '../src/lib/interop/modelmarket';

async function main() {
  const report = await runModelMarketInterop();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = [...report.live, ...report.fixtures].some(({ passed }) => !passed) ? 1 : 0;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
