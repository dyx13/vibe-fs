import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createJournalObserver,
  countFactCase,
} from './e2e/support/journal-observer.js';

async function withTempRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxs-obs-test-'));
  const gitDir = path.join(dir, '.git');
  const eventsDir = path.join(gitDir, 'wanxiangshu', 'events');
  fs.mkdirSync(eventsDir, { recursive: true });
  try {
    return await fn({ dir, gitDir, eventsDir });
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

test('WHAT[verification-system-015] E1: prose decoy does not register as domain fact case', async () => {
  await withTempRepo(async ({ eventsDir }) => {
    const observer = createJournalObserver({
      readFiles: () => {
        const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.ndjson')).sort();
        return files.map((name) => {
          const p = path.join(eventsDir, name);
          const st = fs.statSync(p);
          return {
            path: p,
            dev: st.dev,
            ino: st.ino,
            size: st.size,
            readBytes: (off, len) => {
              const fd = fs.openSync(p, 'r');
              try {
                const b = Buffer.alloc(len);
                const n = fs.readSync(fd, b, 0, len, off);
                return b.subarray(0, n);
              } finally {
                fs.closeSync(fd);
              }
            },
          };
        });
      },
    });

    const writerFile = path.join(eventsDir, 'writer1.ndjson');
    // Event with prose containing 'FailureRecorded' in description text, but not in Fact
    const decoyEvent = {
      event_id: 'evt-1',
      event_type: 'JournalEnvelope',
      parents: [],
      payload: {
        Fact: ['TaskProgress', { comment: 'Decoy text mentioning FailureRecorded in prose' }],
      },
    };
    fs.writeFileSync(writerFile, `${JSON.stringify(decoyEvent)}\n`);

    await observer.refresh();
    const failures = observer.select({ caseName: 'FailureRecorded' });
    assert.equal(failures.length, 0, 'decoy prose must not match Fact case');
    assert.equal(countFactCase([JSON.stringify(decoyEvent)], 'FailureRecorded'), 0);
    await observer.close();
  });
});

test('WHAT[verification-system-015] E2: UTF-8 and trailing line chunking waits for complete line before committing', async () => {
  await withTempRepo(async ({ eventsDir }) => {
    const observer = createJournalObserver({
      readFiles: () => {
        const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.ndjson')).sort();
        return files.map((name) => {
          const p = path.join(eventsDir, name);
          const st = fs.statSync(p);
          return {
            path: p,
            dev: st.dev,
            ino: st.ino,
            size: st.size,
            readBytes: (off, len) => {
              const fd = fs.openSync(p, 'r');
              try {
                const b = Buffer.alloc(len);
                const n = fs.readSync(fd, b, 0, len, off);
                return b.subarray(0, n);
              } finally {
                fs.closeSync(fd);
              }
            },
          };
        });
      },
    });

    const writerFile = path.join(eventsDir, 'writer1.ndjson');
    // First write: line 1 complete, line 2 incomplete with multi-byte UTF-8 split
    const line1 = `${JSON.stringify({ event_id: 'e1', payload: { Fact: ['StepStarted', {}] } })}\n`;
    const line2Prefix = '{"event_id":"e2","payload":{"Fact":["StepFinished",{"msg":"你好';
    // '你' is 3 bytes (0xe4 0xbd 0xa0), '好' is 3 bytes (0xe5 0xa5 0xbd)
    const line2Bytes = Buffer.from(line2Prefix, 'utf8');
    const firstWrite = Buffer.concat([Buffer.from(line1, 'utf8'), line2Bytes.subarray(0, line2Bytes.length - 1)]);

    fs.writeFileSync(writerFile, firstWrite);
    await observer.refresh();

    assert.equal(observer.position(), 1, 'only line 1 should be committed');
    assert.equal(observer.select({ caseName: 'StepStarted' }).length, 1);
    assert.equal(observer.select({ caseName: 'StepFinished' }).length, 0);

    // Second write: complete line 2 with remaining byte and trailer
    const remainingLine2 = Buffer.concat([
      line2Bytes.subarray(line2Bytes.length - 1),
      Buffer.from('"}]}}\n', 'utf8'),
    ]);
    fs.appendFileSync(writerFile, remainingLine2);

    await observer.refresh();
    assert.equal(observer.position(), 2, 'both lines should be committed');
    assert.equal(observer.select({ caseName: 'StepFinished' }).length, 1);
    await observer.close();
  });
});

test('WHAT[verification-system-015] E3: complete line with invalid JSON or identity collision fails closed', async () => {
  await withTempRepo(async ({ eventsDir }) => {
    const getObserver = () => createJournalObserver({
      readFiles: () => {
        const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.ndjson')).sort();
        return files.map((name) => {
          const p = path.join(eventsDir, name);
          const st = fs.statSync(p);
          return {
            path: p,
            dev: st.dev,
            ino: st.ino,
            size: st.size,
            readBytes: (off, len) => {
              const fd = fs.openSync(p, 'r');
              try {
                const b = Buffer.alloc(len);
                const n = fs.readSync(fd, b, 0, len, off);
                return b.subarray(0, n);
              } finally {
                fs.closeSync(fd);
              }
            },
          };
        });
      },
    });

    const writerFile = path.join(eventsDir, 'writer1.ndjson');
    // Corrupt JSON in complete line
    fs.writeFileSync(writerFile, '{"event_id": broken-json}\n');
    const obs = getObserver();
    await assert.rejects(async () => {
      await obs.refresh();
    }, /invalid JSON/);

    // Identity collision: same event_id with different bytes
    fs.writeFileSync(
      writerFile,
      `${JSON.stringify({ event_id: 'col-1', payload: { a: 1 } })}\n` +
      `${JSON.stringify({ event_id: 'col-1', payload: { a: 2 } })}\n`,
    );
    const obs2 = getObserver();
    await assert.rejects(async () => {
      await obs2.refresh();
    }, /identity collision/);
  });
});

test('WHAT[verification-system-015] E4: consumed prefix truncation fails closed', async () => {
  await withTempRepo(async ({ eventsDir }) => {
    const getObserver = () => createJournalObserver({
      readFiles: () => {
        const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.ndjson')).sort();
        return files.map((name) => {
          const p = path.join(eventsDir, name);
          const st = fs.statSync(p);
          return {
            path: p,
            dev: st.dev,
            ino: st.ino,
            size: st.size,
            readBytes: (off, len) => {
              const fd = fs.openSync(p, 'r');
              try {
                const b = Buffer.alloc(len);
                const n = fs.readSync(fd, b, 0, len, off);
                return b.subarray(0, n);
              } finally {
                fs.closeSync(fd);
              }
            },
          };
        });
      },
    });

    const writerFile = path.join(eventsDir, 'writer1.ndjson');
    fs.writeFileSync(writerFile, `${JSON.stringify({ event_id: 'p1', payload: {} })}\n`);
    const obs = getObserver();
    await obs.refresh();
    assert.equal(obs.position(), 1);

    // Truncate file below consumed prefix
    fs.truncateSync(writerFile, 5);
    await assert.rejects(async () => {
      await obs.refresh();
    }, /truncation/);
  });
});

test('WHAT[verification-system-015] file identity replacement fails even when size and bytes are unchanged', async () => {
  const bytes = Buffer.from(`${JSON.stringify({ event_id: 'same-bytes', payload: { Fact: ['Recorded', {}] } })}\n`)
  let inode = 1
  const observer = createJournalObserver({
    readFiles: () => [{
      path: '/fixture/writer.ndjson', dev: 1, ino: inode, size: bytes.length,
      readBytes: (offset, length) => bytes.subarray(offset, offset + length),
    }],
  })
  try {
    await observer.refresh()
    assert.equal(observer.position(), 1)
    inode = 2
    await assert.rejects(observer.refresh(), /file identity replacement/)
    assert.equal(observer.position(), 1)
    await assert.rejects(observer.close(), /file identity replacement/)
  } finally {
    await observer.close()
  }
})

test('WHAT[verification-system-015] multi-writer interleaving, subscription and close semantics', async () => {
  await withTempRepo(async ({ eventsDir }) => {
    const observer = createJournalObserver({
      readFiles: () => {
        const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.ndjson')).sort();
        return files.map((name) => {
          const p = path.join(eventsDir, name);
          const st = fs.statSync(p);
          return {
            path: p,
            dev: st.dev,
            ino: st.ino,
            size: st.size,
            readBytes: (off, len) => {
              const fd = fs.openSync(p, 'r');
              try {
                const b = Buffer.alloc(len);
                const n = fs.readSync(fd, b, 0, len, off);
                return b.subarray(0, n);
              } finally {
                fs.closeSync(fd);
              }
            },
          };
        });
      },
    });

    const received = [];
    const unsub = observer.subscribe((event) => {
      received.push(event.event_id);
    });

    // Write to writer A
    fs.writeFileSync(path.join(eventsDir, 'writerA.ndjson'), `${JSON.stringify({ event_id: 'A1', payload: { Fact: ['FactA', 1] } })}\n`);
    // Write to writer B
    fs.writeFileSync(path.join(eventsDir, 'writerB.ndjson'), `${JSON.stringify({ event_id: 'B1', payload: { Fact: ['FactB', 2] } })}\n`);

    await observer.refresh();
    assert.equal(observer.position(), 2);
    assert.deepEqual(received, ['A1', 'B1']);

    // Query with after: 1
    const afterFirst = observer.select({ after: 1 });
    assert.equal(afterFirst.length, 1);
    assert.equal(afterFirst[0].event_id, 'B1');

    // Close observer
    await observer.close();

    // Writes after close must not trigger subscriber
    fs.appendFileSync(path.join(eventsDir, 'writerA.ndjson'), `${JSON.stringify({ event_id: 'A2', payload: {} })}\n`);
    await observer.refresh();
    assert.equal(received.length, 2, 'closed observer must not notify subscribers');
  });
});
