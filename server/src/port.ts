/**
 * Starting when the port is taken. If a DelegateDesk server already answers there, say so. If an old DelegateDesk
 * server holds the port but no longer answers (paused with Ctrl+Z, or stuck), stop it and take its place.
 * Any other program on the port is left alone.
 */
import { execSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';

const sh = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString(); } catch { return ''; } };

/** Is a DelegateDesk server answering on this port? */
export async function answers(port: number) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2500) });
    return (await r.json())?.app === 'delegatedesk';
  } catch { return false; }
}

/** Process ids listening on the port, with their command lines. */
function holders(port: number): { pid: number; cmd: string }[] {
  if (process.platform === 'win32') {
    const pids = new Set(sh('netstat -ano -p tcp').split(/\r?\n/).filter((l) => new RegExp(`[:.]${port}\\s+\\S+\\s+LISTENING`, 'i').test(l)).map((l) => Number(l.trim().split(/\s+/).pop())).filter(Boolean));
    return [...pids].map((pid) => ({ pid, cmd: sh(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`).trim() }));
  }
  const pids = new Set((sh(`lsof -ti tcp:${port} -sTCP:LISTEN`) || sh(`fuser ${port}/tcp`)).split(/\s+/).map(Number).filter(Boolean));
  if (!pids.size && process.platform === 'linux') {
    // No lsof or fuser: find the socket's inode in /proc/net/tcp*, then the process that owns it.
    const hex = port.toString(16).toUpperCase().padStart(4, '0');
    const inodes = new Set(['/proc/net/tcp', '/proc/net/tcp6'].flatMap((f) => { try { return fs.readFileSync(f, 'utf8').split('\n').slice(1); } catch { return []; } })
      .map((l) => l.trim().split(/\s+/)).filter((c) => c[1]?.endsWith(`:${hex}`) && c[3] === '0A').map((c) => c[9]));
    for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
      try { if (fs.readdirSync(`/proc/${d}/fd`).some((fd) => { try { return inodes.has(fs.readlinkSync(`/proc/${d}/fd/${fd}`).replace(/^socket:\[(\d+)\]$/, '$1')); } catch { return false; } })) pids.add(Number(d)); } catch { /* not ours to read */ }
    }
  }
  return [...pids].filter((pid) => pid !== process.pid).map((pid) => {
    let cmd = '';
    try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { cmd = sh(`ps -o command= -p ${pid}`).trim(); }
    return { pid, cmd };
  });
}

const isOurs = (cmd: string) => /server[\\/]src[\\/]index\.ts/.test(cmd);

/** Stop old DelegateDesk servers on the port. Returns how many were stopped; other programs are never touched. */
export function stopOldServers(port: number) {
  const ours = holders(port).filter((h) => isOurs(h.cmd));
  for (const h of ours) {
    try {
      if (process.platform === 'win32') sh(`taskkill /PID ${h.pid} /T /F`);
      else { try { process.kill(h.pid, 'SIGCONT'); } catch { /* not paused */ } process.kill(h.pid, 'SIGKILL'); }
    } catch { /* already gone */ }
  }
  return { stopped: ours.length, others: holders(port).filter((h) => !isOurs(h.cmd)).length };
}

/** Can this process listen on the port right now? */
const isFree = (port: number) => new Promise<boolean>((done) => {
  const probe = net.createServer().once('error', () => done(false)).once('listening', () => probe.close(() => done(true)));
  probe.listen(port);
});

/** Make sure the port is ours to use before starting; exits with a clear message when it cannot be. */
export async function freePort(port: number) {
  if (await isFree(port)) return;
  if (await answers(port)) {
    console.log(`\nDelegateDesk is already running at http://localhost:${port}. Open that address; there is nothing else to start.\n`);
    process.exit(0);
  }
  const { stopped, others } = stopOldServers(port);
  if (stopped) {
    console.log(`An old DelegateDesk server on port ${port} had stopped answering (paused or stuck); it was closed.`);
    for (let i = 0; i < 20; i++) { if (await isFree(port)) return; await new Promise((r) => setTimeout(r, 250)); }
  }
  console.error(others ? `\nPort ${port} is used by another program. Close it, or set PORT to a different number in .env.\n`
    : `\nPort ${port} is busy and the program holding it could not be found. Run "npm run stop", or restart the codespace.\n`);
  process.exit(1);
}
