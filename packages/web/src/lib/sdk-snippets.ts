/**
 * SDK discovery snippets per language.
 * Each function takes the domain discovered and returns ready-to-copy code.
 *
 * Reused by both the landing quick-start and the workbench post-discovery panel.
 */

type SnippetLanguage = 'typescript' | 'python' | 'go' | 'rust' | 'java' | 'dotnet';

const INSTALL_COMMANDS: Record<SnippetLanguage, string> = {
  typescript: 'npm install @agentcommunity/aid',
  python: 'pip install aid-discovery',
  go: 'source checkout: packages/aid-go + go mod replace',
  rust: 'source checkout: packages/aid-rs',
  java: 'source checkout: packages/aid-java',
  dotnet: 'source checkout: packages/aid-dotnet',
};

function buildSnippets(domain: string): Record<SnippetLanguage, string> {
  return {
    typescript: `import { discover } from '@agentcommunity/aid'

const { record } = await discover('${domain}')
console.log(record.proto, record.uri)`,
    python: `from aid_py import discover

record, ttl = discover('${domain}')
print(record["uri"], ttl)`,
    go: `import (
    "fmt"
    "time"

    aid "github.com/agentcommunity/aid-go"
)

record, ttl, err := aid.Discover("${domain}", 5*time.Second)
if err != nil { /* handle */ }
fmt.Println(record.URI, ttl)`,
    rust: `use aid_rs::discover;
use std::time::Duration;

let rec = discover("${domain}", Duration::from_secs(5)).await?;
println!("{} {}", rec.proto, rec.uri);`,
    java: `import org.agentcommunity.aid.Discovery;

var result = Discovery.discover("${domain}", new DiscoveryOptions());
System.out.println(result.record.proto + " at " + result.record.uri);`,
    dotnet: `using AidDiscovery;

var result = await Discovery.DiscoverAsync("${domain}");
Console.WriteLine($"{result.Record.Proto} at {result.Record.Uri}");`,
  };
}

const LANGUAGE_LABELS: Record<SnippetLanguage, string> = {
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  dotnet: '.NET',
};

const LANGUAGES: SnippetLanguage[] = ['typescript', 'python', 'go', 'rust', 'java', 'dotnet'];

export { buildSnippets, INSTALL_COMMANDS, LANGUAGE_LABELS, LANGUAGES };
export type { SnippetLanguage };
