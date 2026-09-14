import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const imageDir = path.join(root, 'assets', 'images');
const sourceExtensions = new Set(['.jpg', '.jpeg', '.png']);
const minimumBytes = 100 * 1024;
const maxWidth = 1600;
const filesToScan = ['*.html', 'assets/**/*.js', 'src/**/*.js'];

async function getFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await getFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function updateReferences(replacements) {
  const files = [];
  for (const pattern of filesToScan) {
    if (pattern === '*.html') {
      files.push(...(await fs.readdir(root)).filter((name) => name.endsWith('.html')).map((name) => path.join(root, name)));
    } else {
      const base = path.join(root, pattern.split('/')[0]);
      if (await fs.stat(base).catch(() => null)) files.push(...(await getFiles(base)).filter((file) => /\.(html|js)$/.test(file)));
    }
  }

  for (const file of [...new Set(files)]) {
    let text = await fs.readFile(file, 'utf8');
    let updated = text;
    for (const [from, to] of replacements) updated = updated.split(from).join(to);
    if (updated !== text) await fs.writeFile(file, updated, 'utf8');
  }
}

const files = await getFiles(imageDir);
const replacements = [];
let converted = 0;
let savedBytes = 0;

for (const source of files) {
  const extension = path.extname(source).toLowerCase();
  const stats = await fs.stat(source);
  if (!sourceExtensions.has(extension) || stats.size < minimumBytes) continue;

  const baseName = path.basename(source, extension);
  const target = path.join(path.dirname(source), `${baseName}.webp`);
  const image = sharp(source);
  const metadata = await image.metadata();
  const pipeline = image.resize({ width: Math.min(metadata.width || maxWidth, maxWidth), withoutEnlargement: true });
  await pipeline.webp({ quality: 82, effort: 6 }).toFile(target);

  const outputStats = await fs.stat(target);
  if (outputStats.size >= stats.size) {
    await fs.unlink(target);
    continue;
  }

  const relativeSource = `/assets/images/${path.relative(imageDir, source).replaceAll('\\', '/')}`;
  const relativeTarget = relativeSource.replace(/\.(jpg|jpeg|png)$/i, '.webp');
  replacements.push([relativeSource, relativeTarget]);
  await fs.unlink(source);
  converted += 1;
  savedBytes += stats.size - outputStats.size;
  console.log(`${path.basename(source)} -> ${path.basename(target)} (${Math.round(stats.size / 1024)} KB -> ${Math.round(outputStats.size / 1024)} KB)`);
}

await updateReferences(replacements);
console.log(`Converted: ${converted}`);
console.log(`Saved: ${Math.round(savedBytes / 1024 / 1024 * 100) / 100} MB`);
