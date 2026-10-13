/**
 * Start / stop / inspect the voting-only wire-tier MJAPI host (packages/TestHost).
 *
 *   node test-harnesses/host.mjs start     boots it in the background (detached), waits until GraphQL answers
 *   node test-harnesses/host.mjs stop      stops the process recorded in the pid file
 *   node test-harnesses/host.mjs restart
 *   node test-harnesses/host.mjs status    prints pid / port / log path and whether GraphQL answers
 *
 * Environment (all optional):
 *   VOTING_WIRE_PORT      listen port (default 4104)
 *   VOTING_WIRE_RUN_DIR   where the pid file and log live (default <repo>/tmp, gitignored)
 *
 * The host only ever serves MJ_Voting_Dev. Credentials come from the voting repo .env and are never printed.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

const port = process.env.VOTING_WIRE_PORT ?? '4104';
const runDir = process.env.VOTING_WIRE_RUN_DIR ?? path.join(repoRoot, 'tmp');
const pidFile = path.join(runDir, 'voting-wire-host.pid');
const logFile = path.join(runDir, 'voting-wire-host.log');
const url = `http://localhost:${port}/`;
const startScript = path.join(repoRoot, 'packages', 'TestHost', 'src', 'start-host.mjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readPid() {
    if (!existsSync(pidFile)) return null;
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    try {
        process.kill(pid, 0);
        return pid;
    } catch {
        return null;
    }
}

async function answers() {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-mj-api-key': process.env.MJ_API_KEY ?? '' },
            body: JSON.stringify({ query: '{ __typename }' }),
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function start() {
    const running = readPid();
    if (running) {
        console.log(`already running (pid ${running}) on ${url}`);
        return;
    }
    if (await answers()) {
        console.error(`something else already answers on ${url}; set VOTING_WIRE_PORT or stop it first`);
        process.exit(1);
    }
    mkdirSync(runDir, { recursive: true });
    const out = openSync(logFile, 'w');
    const child = spawn(process.execPath, [startScript], {
        cwd: path.dirname(startScript),
        detached: true,
        stdio: ['ignore', out, out],
        env: { ...process.env, VOTING_WIRE_PORT: port },
    });
    child.unref();
    writeFileSync(pidFile, String(child.pid));
    // Keep the Mac awake for as long as the host lives (sleep makes SQL requests time out for no real reason).
    if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(child.pid)], { detached: true, stdio: 'ignore' }).unref();
    for (let waited = 0; waited < 180_000; waited += 2000) {
        await sleep(2000);
        if (!readPid()) {
            console.error(`host exited during startup; see ${logFile}`);
            process.exit(1);
        }
        if (await answers()) {
            console.log(`voting wire host up: pid ${child.pid}, ${url}, log ${logFile}`);
            return;
        }
    }
    console.error(`host did not answer within 180s; see ${logFile}`);
    process.exit(1);
}

async function stop() {
    const pid = readPid();
    if (!pid) {
        console.log('not running');
        rmSync(pidFile, { force: true });
        return;
    }
    process.kill(pid, 'SIGTERM');
    for (let i = 0; i < 20 && readPid(); i++) await sleep(500);
    if (readPid()) process.kill(pid, 'SIGKILL');
    rmSync(pidFile, { force: true });
    console.log(`stopped pid ${pid}`);
}

async function status() {
    const pid = readPid();
    console.log(`pid:  ${pid ?? '(not running)'}\nurl:  ${url}\nlog:  ${logFile}\nlive: ${(await answers()) ? 'GraphQL answers' : 'no answer'}`);
}

const command = process.argv[2] ?? 'status';
if (command === 'start') await start();
else if (command === 'stop') await stop();
else if (command === 'restart') {
    await stop();
    await start();
} else if (command === 'status') await status();
else {
    console.error('usage: node test-harnesses/host.mjs start|stop|restart|status');
    process.exit(2);
}
