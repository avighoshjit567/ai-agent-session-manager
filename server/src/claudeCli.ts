import { spawn } from 'node:child_process';

export interface RunClaudeOptions {
  timeoutMs?: number;
  cwd?: string;
}

// Run `claude -p` headlessly, sending the prompt over stdin (avoids ARG_MAX with
// many sessions) and returning trimmed stdout. Pure text generation — no tools,
// so no permission flags are needed.
export function runClaudeHeadless(prompt: string, opts: RunClaudeOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p'], { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    // If the child dies before stdin drains, Node emits 'error' on the stdin
    // stream itself; swallow it — the child 'error'/'close'/timeout handlers
    // below already settle the promise.
    child.stdin.on('error', () => {});

    let out = '';
    let err = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));

    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') {
        reject(new Error('Claude CLI not found — install it to generate recaps.'));
      } else {
        reject(e);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Recap generation timed out after ${timeoutMs / 1000}s.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(err.trim() || `claude exited with code ${code}`));
        return;
      }
      const text = out.trim();
      if (!text) {
        reject(new Error('Claude returned an empty recap.'));
        return;
      }
      resolve(text);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
