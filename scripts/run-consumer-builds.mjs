import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoRoot = resolve(packageRoot, '..', '..', '..', 'demo', 'test-demos');
const npmCommand =
  process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
const allDemos = ['angular-esbuild', 'vite', 'webpack', 'next-react', 'vue-vite'];
const demos = process.env.DEMO_ONLY
  ? allDemos.filter((demo) => demo === process.env.DEMO_ONLY)
  : allDemos;

function npmArguments(args) {
  return process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...args] : args;
}

function run(args, cwd) {
  return execFileSync(npmCommand, npmArguments(args), {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  });
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}

async function startStaticServer(root, demo) {
  const server = createServer((request, response) => {
    const requestedPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const relativePath = requestedPath === '/' ? '/index.html' : requestedPath;
    const filePath = resolve(root, `.${relativePath}`);

    if (!filePath.startsWith(resolve(root))) {
      response.writeHead(403).end();
      return;
    }

    if (existsSync(filePath)) {
      response.writeHead(200, { 'content-type': contentType(filePath) });
      response.end(readFileSync(filePath));
      return;
    }

    if (demo === 'webpack' && relativePath === '/index.html') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        '<!doctype html><html><body><p id="status">pending</p><script src="/main.js"></script></body></html>',
      );
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
  const address = server.address();

  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not determine the consumer server port.');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveServer) => server.close(resolveServer)),
  };
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await globalThis.fetch(url);
      if (response.ok) return;
    } catch {
      // The Next.js server may need a few seconds to start.
    }

    await new Promise((resolveDelay) => globalThis.setTimeout(resolveDelay, 500));
  }

  throw new Error(`Consumer server did not start: ${url}`);
}

async function verifyRuntime(demo, demoDirectory, outputDirectory) {
  const browser = await chromium.launch({ headless: true });
  let server;
  let nextProcess;

  try {
    if (demo === 'next-react') {
      const port = 4700 + allDemos.indexOf(demo);
      nextProcess = spawn(
        process.execPath,
        [
          join(demoDirectory, 'node_modules/next/dist/bin/next'),
          'start',
          '-p',
          String(port),
        ],
        { cwd: demoDirectory, stdio: 'ignore', windowsHide: true },
      );
      server = { url: `http://127.0.0.1:${port}`, close: () => undefined };
      await waitForServer(server.url);
    } else {
      const staticRoot =
        demo === 'angular-esbuild' ? join(outputDirectory, 'browser') : outputDirectory;
      server = await startStaticServer(staticRoot, demo);
    }

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      pageErrors.push(
        `${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`,
      );
    });
    page.on('worker', (worker) => {
      globalThis.console.log(`Worker started: ${worker.url()}`);
      void worker
        .evaluate(() => ({
          onmessage: typeof globalThis.onmessage,
          createImageBitmap: typeof globalThis.createImageBitmap,
          offscreenCanvas: typeof globalThis.OffscreenCanvas,
        }))
        .then((details) =>
          globalThis.console.log(`Worker capabilities: ${JSON.stringify(details)}`),
        )
        .catch(() => undefined);
    });
    await page.goto(server.url, { waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(
        () =>
          globalThis.document
            .querySelector('#status')
            ?.textContent?.startsWith('worker-ok:') ?? false,
        undefined,
        { timeout: 30_000 },
      );
    } catch (error) {
      const status = await page
        .locator('#status')
        .textContent({ timeout: 1_000 })
        .catch(() => null);
      throw new Error(
        `${demo} Worker runtime failed: status=${status}; errors=${pageErrors.join(' | ')}`,
        { cause: error },
      );
    }
    await page.close();
    globalThis.console.log(`Verified Worker runtime: ${demo}`);
  } finally {
    await server?.close();
    nextProcess?.kill();
    await browser.close();
  }
}

if (!existsSync(demoRoot)) {
  throw new Error(`Consumer demo directory does not exist: ${demoRoot}`);
}

const packOutput = execFileSync(
  npmCommand,
  npmArguments(['pack', '--json', '--pack-destination', demoRoot]),
  { cwd: packageRoot, encoding: 'utf8' },
);
const packMetadata = JSON.parse(packOutput);
const packedPackage = Array.isArray(packMetadata)
  ? packMetadata[0]
  : Object.values(packMetadata)[0];
const packedName = packedPackage?.filename;
const tarball = join(demoRoot, packedName);

if (!packedName || !existsSync(tarball)) {
  throw new Error('npm pack did not produce a consumer tarball.');
}

try {
  for (const demo of demos) {
    const demoDirectory = join(demoRoot, demo);
    globalThis.console.log(`\nBuilding ${demo}...`);
    run(['install', '--no-audit', '--no-fund', '--package-lock=false'], demoDirectory);
    run(
      [
        'install',
        '--no-save',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        tarball,
      ],
      demoDirectory,
    );
    run(['run', 'build'], demoDirectory);

    const outputDirectory = join(demoDirectory, demo === 'next-react' ? '.next' : 'dist');
    const outputFiles = listFiles(outputDirectory);
    const workerOutput =
      outputFiles.find((file) => file.includes('image-slim.worker')) ??
      outputFiles.find(
        (file) =>
          basename(file) !== 'main.js' &&
          file.endsWith('.js') &&
          readFileSync(file, 'utf8').includes('WORKER_UNAVAILABLE'),
      );

    if (!workerOutput) {
      throw new Error(
        `${demo} built successfully but emitted no ImageSlim Worker artifact.`,
      );
    }

    globalThis.console.log(`Verified Worker artifact: ${workerOutput}`);
    await verifyRuntime(demo, demoDirectory, outputDirectory);
  }
} finally {
  if (existsSync(tarball)) {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(tarball);
  }
}
