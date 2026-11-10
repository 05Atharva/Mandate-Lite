import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const root = process.cwd();
const seen = new Set();
const notices = [];
function visit(name, from) {
  const require = createRequire(from);
  let folder;
  try {
    folder = dirname(require.resolve(name));
    while (
      !existsSync(resolve(folder, 'package.json')) ||
      JSON.parse(readFileSync(resolve(folder, 'package.json'), 'utf8')).name !== name ||
      !readdirSync(folder).some((file) => /^licen[cs]e(?:\.(?:md|txt))?$/i.test(file))
    ) {
      const parent = dirname(folder);
      if (parent === folder) throw new Error(`Package metadata not found: ${name}`);
      folder = parent;
    }
  } catch {
    folder = resolve(root, 'node_modules', name);
  }
  const metadata = resolve(folder, 'package.json');
  if (seen.has(metadata)) return;
  seen.add(metadata);
  const pkg = JSON.parse(readFileSync(metadata, 'utf8'));
  const file = readdirSync(folder).find((file) => /^licen[cs]e(?:\.(?:md|txt))?$/i.test(file));
  if (!file)
    throw new Error(
      `Retain the license for bundled dependency ${name}; no license file was found.`,
    );
  notices.push(
    `${pkg.name} ${pkg.version}\n${'='.repeat(60)}\n${readFileSync(resolve(folder, file), 'utf8')}\n`,
  );
  for (const dependency of Object.keys(pkg.dependencies ?? {})) visit(dependency, metadata);
}
for (const name of ['react', 'react-dom', 'lucide-react', 'ag-grid-react', 'ag-grid-community'])
  visit(name, resolve(root, 'package.json'));
mkdirSync('public', { recursive: true });
writeFileSync(
  'public/third-party-licenses.txt',
  `Third-party notices for browser dependencies bundled with Mandate Lite.\nServer/development packages retain their own licenses in node_modules.\n\n${notices.join('\n')}`,
);
console.log(`Retained license notices for ${notices.length} bundled browser dependencies.`);
