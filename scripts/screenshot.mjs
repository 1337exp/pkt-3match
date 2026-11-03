#!/usr/bin/env node
/**
 * Screenshots of the running game for the README: the menu, the Classic mode after a move and the Live mode mid-play.
 *
 *   npm run screenshot                                         starts its own dev server on a spare port
 *   SCREENSHOT_URL=http://localhost:5175 npm run screenshot    use a server that is already running
 *
 * Needs Chrome or Edge installed (driven through playwright-core, nothing is downloaded).
 * Output: docs/media/menu.png, classic.png, live.png. WebGL is rendered in software, so it takes a while.
 *
 * The game is played through the dev hook `window.stage` (dev server only) and the real pointer events.
 * Time is advanced by hand, because a software-rendered page gives only a few frames per second and the
 * animations would otherwise crawl.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'media');
mkdirSync(OUT, { recursive: true });

async function waitFor(url, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try {
            if ((await fetch(url)).ok) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`The dev server did not come up at ${url}`);
}

async function startServer() {
    if (process.env.SCREENSHOT_URL) return { url: process.env.SCREENSHOT_URL, stop() {} };
    const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const port = 5189;
    const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    const url = `http://localhost:${port}`;
    await waitFor(url);
    return { url, stop: () => child.kill() };
}

async function launch() {
    // Software WebGL, so it works without a GPU and in headless mode.
    const flags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    for (const channel of ['chrome', 'msedge']) {
        try {
            return await chromium.launch({ channel, args: flags });
        } catch {
            // try the next one
        }
    }
    throw new Error('Neither Chrome nor Edge could be launched');
}

/** Runs in the page: plays the game by hand. */
function installHelpers() {
    const flush = async () => {
        for (let i = 0; i < 4; i++) await Promise.resolve();
    };
    window.__advance = async (seconds) => {
        for (let t = 0; t < seconds; t += 1 / 30) {
            window.stage.animator.tick(1 / 30);
            window.stage.mode.update(window.stage.time, 1 / 30);
            await flush();
        }
    };
    const pointer = (type, cell) => {
        const { x, y } = window.stage.clientOfCell(cell[0], cell[1]);
        document.querySelector('canvas').dispatchEvent(
            new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, isPrimary: true }),
        );
    };
    window.__drag = (from, to) => {
        pointer('pointerdown', from);
        pointer('pointermove', to);
    };
    window.__drop = (cell) => pointer('pointerup', cell);
}

const server = await startServer();
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 640, height: 900 }, deviceScaleFactor: 1 });
    const shot = async (name) => {
        await page.screenshot({ path: join(OUT, `${name}.png`) });
        console.log(`docs/media/${name}.png`);
    };

    // The menu.
    await page.goto(server.url);
    await page.waitForSelector('.menu-card');
    await shot('menu');

    // Classic: one move that builds a five in a row, played out to the end, so the shapes row has lit up.
    await page.goto(`${server.url}/?mode=static`);
    await page.waitForSelector('canvas');
    await page.evaluate(installHelpers);
    await page.evaluate(async () => {
        window.stage.newGame(6);
        await window.__advance(4);
        window.__drag([2, 3], [2, 4]);
        window.__drop([2, 4]);
        await window.__advance(12);
    });
    await shot('classic');

    // Live: a move, and while its balls are still bursting and falling, another ball is grabbed and dragged.
    await page.goto(`${server.url}/?mode=dynamic`);
    await page.waitForSelector('canvas');
    await page.evaluate(installHelpers);
    await page.evaluate(async () => {
        window.stage.newGame(1);
        await window.__advance(4);
        window.__drag([2, 1], [3, 1]);
        await window.__advance(0.1); // the ball walks to its target one simulation step at a time
        window.__drop([3, 1]);
        await window.__advance(0.3);
        window.__drag([0, 4], [1, 3]);
        await window.__advance(0.25);
    });
    await shot('live');
} finally {
    await browser.close();
    server.stop();
}
