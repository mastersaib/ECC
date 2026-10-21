/**
 * Tests for the Galley proofreader platform pieces: AI prompt and response
 * handling, trends history, three-way merge, the sync state machine,
 * DOCX/PDF export, the local server and the artifact build.
 *
 * Run with: node tests/examples/proofreader-platform.test.js
 */

const assert = require('assert');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'examples', 'proofreader');
const LIB = path.join(ROOT, 'public', 'lib');
const Engine = require(path.join(LIB, 'engine'));
const AI = require(path.join(LIB, 'ai'));
const History = require(path.join(LIB, 'history'));
const Merge = require(path.join(LIB, 'merge'));
const Sync = require(path.join(LIB, 'sync'));
const Exporter = require(path.join(LIB, 'exporters'));
const server = require(path.join(ROOT, 'server'));
const { build } = require(path.join(ROOT, 'build-artifact'));

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params) {
          calls.push(params);
          return { finalMessage: async () => reply };
        }
      }
    }
  };
}

function textReply(obj, stopReason) {
  return { stop_reason: stopReason || 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: { 'Content-Type': 'application/json' } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n=== Testing Galley proofreader platform ===\n');
  let passed = 0;
  let failed = 0;
  const t = async (name, fn) => ((await test(name, fn)) ? passed++ : failed++);
  const profile = Engine.resolveProfile({ dialect: 'en-US', style: 'house' });

  console.log('AI prompts and parsing:');

  await t('proofread prompt carries dialect, guide, voice rules and known findings', () => {
    const { system, user } = AI.buildProofreadPrompt({ text: 'Hello.', profile, flow: false, findings: [{ text: 'teh', message: 'Typo' }] });
    assert.ok(system.includes('American English'));
    assert.ok(system.includes('Manuscript House Style'));
    assert.ok(system.includes('Preserve the author\'s voice'));
    assert.ok(system.includes('"As well as" is not a coordinating conjunction'));
    assert.ok(system.includes('"teh": Typo'));
    assert.ok(system.includes('Do not make flow'));
    assert.ok(user.includes('<<<\nHello.\n>>>'));
  });

  await t('flow mode asks for minimal, meaning-preserving edits', () => {
    const { system } = AI.buildProofreadPrompt({ text: 'x', profile, flow: true });
    assert.ok(system.includes('keeps the author\'s words and meaning'));
  });

  await t('chunkText splits on paragraph boundaries and keeps offsets', () => {
    const para = `${'word '.repeat(200)}\n`;
    const text = para.repeat(30);
    const chunks = AI.chunkText(text, 3000);
    assert.ok(chunks.length > 1);
    for (const c of chunks) assert.strictEqual(text.slice(c.offset, c.offset + c.text.length), c.text);
    assert.ok(chunks.slice(0, -1).every(c => c.text.endsWith('\n')));
  });

  await t('parseJson accepts plain, fenced and wrapped JSON', () => {
    assert.deepStrictEqual(AI.parseJson('{"a":1}'), { a: 1 });
    assert.deepStrictEqual(AI.parseJson('```json\n{"a":2}\n```'), { a: 2 });
    assert.deepStrictEqual(AI.parseJson('Here you go: {"a":3} Thanks.'), { a: 3 });
    assert.throws(() => AI.parseJson('no json'));
  });

  await t('locateIssues maps quotes to ranges, using context for repeats', () => {
    const text = 'The cat sat. The cat sat on the mat they was on.';
    const parsed = {
      issues: [
        { quote: 'The cat sat', context: 'The cat sat on the mat they was on.', action: 'note', replacement: '', category: 'grammar', severity: 'info', message: 'm', explanation: 'e' },
        { quote: 'they was', context: 'The cat sat on the mat they was on.', action: 'replace', replacement: 'they were', category: 'grammar', severity: 'error', message: 'Agreement', explanation: 'e' },
        { quote: 'not in text', context: '', action: 'replace', replacement: 'x', category: 'grammar', severity: 'error', message: 'm', explanation: 'e' }
      ]
    };
    const { issues, dropped } = AI.locateIssues(text, { text, offset: 0 }, parsed);
    assert.strictEqual(dropped, 1);
    assert.strictEqual(issues[0].start, 13);
    assert.strictEqual(issues[0].replacement, null);
    // Narrowed to the word that changes
    assert.strictEqual(text.slice(issues[1].start, issues[1].end), 'was');
    assert.strictEqual(issues[1].replacement, 'were');
    assert.strictEqual(issues[1].source, 'ai');
  });

  await t('AI fixes never delete or rewrite the author\'s sentences', () => {
    const text = 'He left at dawn. The road was empty and the sky was grey. She waited by the gate.';
    const ctx = 'The road was empty and the sky was grey.';
    const raw = (quote, action, replacement, category) => ({
      quote, context: quote, action, replacement, category: category || 'grammar', severity: 'error', message: 'm', explanation: 'e'
    });
    const { issues } = AI.locateIssues(text, { text, offset: 0 }, {
      issues: [
        raw('He left at dawn.', 'delete', ''),
        raw(ctx, 'replace', 'The road was empty.'),
        raw('She waited by the gate.', 'replace', 'She lingered near the old iron gate, waiting.'),
        raw('the sky was grey', 'replace', 'the sky looked grey', 'flow'),
        raw('was grey', 'replace', 'was gray')
      ]
    });
    const [del, cut, rewrite, flow, spelling] = issues;
    for (const issue of [del, cut, rewrite]) {
      assert.strictEqual(issue.replacement, null, `${issue.text} is not applicable`);
      assert.ok(issue.suggestion !== undefined && issue.guard, 'the proposal is kept as a suggestion with a reason');
    }
    assert.strictEqual(del.guard, 'It would delete a whole sentence.');
    assert.match(cut.guard, /remove 5 of your words/);
    assert.match(rewrite.guard, /rewrite your wording/);
    assert.strictEqual(flow.replacement, null, 'flow is always the author\'s call');
    assert.strictEqual(flow.suggestion, 'the sky looked grey');
    assert.strictEqual(spelling.text, 'grey');
    assert.strictEqual(spelling.replacement, 'gray', 'a one-word fix still applies');
    const Engine = require(path.join(ROOT, 'public', 'lib', 'engine'));
    const { text: after, applied } = Engine.applyFixes(text, issues.concat(Object.assign({}, del, { replacement: '' })));
    assert.strictEqual(applied, 1);
    assert.strictEqual(after, text.replace('was grey', 'was gray'), 'applyFixes refuses a sentence deletion even if forced');
  });

  await t('AI notes and flow suggestions survive relocation as suggestions', () => {
    const text = 'Alpha they was here.';
    const { issues } = AI.locateIssues(text, { text, offset: 0 }, {
      issues: [{ quote: 'Alpha they was here.', context: 'Alpha they was here.', action: 'note', replacement: 'They were here, Alpha.', category: 'flow', severity: 'suggestion', message: 'm', explanation: 'e' }]
    });
    const moved = AI.relocateIssues('Intro. Alpha they was here.', issues);
    assert.strictEqual(moved[0].replacement, null);
    assert.strictEqual(moved[0].suggestion, 'They were here, Alpha.');
    assert.strictEqual(moved[0].start, 7);
  });

  await t('relocateIssues follows edits and drops fixed findings', () => {
    const text = 'Alpha they was here.';
    const { issues } = AI.locateIssues(text, { text, offset: 0 }, {
      issues: [{ quote: 'they was', context: 'Alpha they was here.', action: 'replace', replacement: 'they were', category: 'grammar', severity: 'error', message: 'm', explanation: 'e' }]
    });
    const moved = AI.relocateIssues('New start. Alpha they was here.', issues);
    assert.strictEqual(moved[0].start, 22, 'the narrowed span ("was") moves with the text');
    assert.strictEqual(moved[0].text, 'was');
    assert.strictEqual(AI.relocateIssues('Alpha they were here.', issues).length, 0);
  });

  console.log('\nHistory:');

  await t('snapshots of one document within ten minutes merge', () => {
    const result = Engine.check('teh cat. i ran.', { style: 'dialect' });
    const a = History.snapshot(result, { docId: 'd1', at: '2026-10-01T10:00:00Z' });
    const b = History.snapshot(result, { docId: 'd1', at: '2026-10-01T10:05:00Z' });
    const c = History.snapshot(result, { docId: 'd1', at: '2026-10-01T11:00:00Z' });
    let log = History.record([], a);
    log = History.record(log, b);
    assert.strictEqual(log.length, 1);
    log = History.record(log, c);
    assert.strictEqual(log.length, 2);
  });

  await t('summarize reports rates, change and recurring rules', () => {
    const early = History.snapshot(Engine.check('teh cat. teh dog. i ran.', { style: 'dialect' }), { docId: 'a', at: '2026-10-01T10:00:00Z' });
    const late = History.snapshot(Engine.check('The cat and the dog ran home quickly today.', { style: 'dialect' }), { docId: 'b', at: '2026-10-02T10:00:00Z' });
    const s = History.summarize([early, late]);
    assert.strictEqual(s.sessions, 2);
    assert.ok(s.firstRate > s.currentRate);
    assert.strictEqual(s.change, -100);
    const typo = s.topRules.find(r => r.id === 'typo');
    assert.strictEqual(typo.count, 2);
    assert.ok(typo.samples.includes('teh'));
    assert.ok(s.topRules[0].count >= typo.count, 'sorted by count');
  });

  console.log('\nMerge and sync:');

  await t('merge3 combines edits to different paragraphs', () => {
    const r = Merge.merge3('A\nB\nC', 'A1\nB\nC', 'A\nB\nC3');
    assert.strictEqual(r.text, 'A1\nB\nC3');
    assert.strictEqual(r.conflicts, 0);
  });

  await t('merge3 keeps local wording on overlap and reports theirs', () => {
    const r = Merge.merge3('A\nB\nC', 'A\nB-mine\nC', 'A\nB-theirs\nC');
    assert.strictEqual(r.text, 'A\nB-mine\nC');
    assert.strictEqual(r.conflicts, 1);
    assert.deepStrictEqual(r.theirsConflicts, ['B-theirs']);
  });

  await t('merge3 handles inserts and deletes on both sides', () => {
    assert.strictEqual(Merge.merge3('A\nB\nC', 'X\nA\nB\nC', 'A\nC\nY').text, 'X\nA\nC\nY');
  });

  await t('two clients saving at the same moment lose nothing', () => {
    let remote = { text: 'P1\nP2\nP3', rev: 4, writeId: 'w0' };
    let a = Sync.create(remote);
    let b = Sync.create(remote);
    let aText = 'P1 by A\nP2\nP3';
    let bText = 'P1\nP2\nP3 by B';
    const wa = Sync.prepareWrite(a, aText, 'ua');
    a = wa.state;
    const wb = Sync.prepareWrite(b, bText, 'ub');
    b = wb.state;
    remote = wb.doc; // the store kept only B's write
    let r = Sync.onRemote(a, remote, aText);
    a = r.state;
    aText = r.localText;
    assert.strictEqual(aText, 'P1 by A\nP2\nP3 by B');
    assert.ok(r.needsSave);
    const again = Sync.prepareWrite(a, aText, 'ua');
    remote = again.doc;
    r = Sync.onRemote(b, wb.doc, bText);
    b = r.state;
    r = Sync.onRemote(b, remote, bText);
    bText = r.localText;
    assert.strictEqual(bText, 'P1 by A\nP2\nP3 by B');
    assert.ok(!r.needsSave);
  });

  await t('own write echoes are recognized and not re-merged', () => {
    let s = Sync.create({ text: 'one', rev: 1, writeId: 'w1' });
    const w = Sync.prepareWrite(s, 'one two', 'me');
    s = w.state;
    const r = Sync.onRemote(s, w.doc, 'one two');
    assert.strictEqual(r.fromOther, false);
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.state.synced.rev, 2);
  });

  await t('a remote edit with no local changes is adopted directly', () => {
    const s = Sync.create({ text: 'one', rev: 1, writeId: 'w1' });
    const r = Sync.onRemote(s, { text: 'one two', rev: 2, baseRev: 1, writeId: 'w2' }, 'one');
    assert.strictEqual(r.localText, 'one two');
    assert.ok(r.changed && r.fromOther && !r.needsSave);
  });

  console.log('\nExport:');

  await t('zip output has valid signatures and CRCs', () => {
    const bytes = Exporter.zip([{ name: 'a.txt', data: 'hello' }]);
    const view = new DataView(bytes.buffer);
    assert.strictEqual(view.getUint32(0, true), 0x04034b50);
    assert.strictEqual(view.getUint32(14, true), Exporter.crc32(new TextEncoder().encode('hello')));
    assert.strictEqual(view.getUint32(bytes.length - 22, true), 0x06054b50);
    assert.strictEqual(Exporter.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  });

  await t('docx contains the WordprocessingML parts and italic runs', () => {
    const bytes = Exporter.toDocx({ title: 'T & T', text: 'A *thud* <here>.' });
    const text = Buffer.from(bytes).toString('latin1');
    for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', '_rels/.rels']) assert.ok(text.includes(part), part);
    assert.ok(text.includes('<w:i/></w:rPr><w:t xml:space="preserve">thud</w:t>'));
    assert.ok(text.includes('T &amp; T'));
    assert.ok(text.includes('&lt;here&gt;'));
  });

  await t('pdf has a consistent cross-reference table and WinAnsi text', () => {
    const bytes = Exporter.toPdf({ title: 'Test', text: `“Quote” — dash (paren) back\\slash\n${'word '.repeat(2000)}` });
    const pdf = Buffer.from(bytes).toString('latin1');
    assert.ok(pdf.startsWith('%PDF-1.4'));
    assert.ok(pdf.trimEnd().endsWith('%%EOF'));
    const startxref = Number(pdf.match(/startxref\n(\d+)/)[1]);
    assert.strictEqual(pdf.slice(startxref, startxref + 4), 'xref');
    const offsets = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
    offsets.forEach((off, i) => assert.ok(pdf.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
    assert.ok(pdf.includes('\\223Quote\\224'));
    assert.ok(pdf.includes('\\(paren\\)'));
    assert.ok((pdf.match(/\/Type \/Page /g) || []).length > 1, 'long text spans pages');
  });

  await t('report lists each finding with its fix', () => {
    const text = 'teh cat';
    const result = Engine.check(text, { style: 'dialect' });
    const report = Exporter.reportText(text, result.issues, result.profile);
    assert.ok(report.includes('"teh" → "the"'));
  });

  console.log('\nServer:');

  await t('handleAi sends a schema-constrained, fallback-enabled request', async () => {
    const client = fakeClient(textReply({ issues: [] }));
    const out = await server.handleAi({ kind: 'proofread', text: 'Hello.', options: { dialect: 'en-GB', style: 'harts' }, flow: true, findings: [] }, client);
    assert.deepStrictEqual(out, { issues: [] });
    const p = client.calls[0];
    assert.strictEqual(p.model, 'claude-opus-5-5');
    assert.strictEqual(p.fallbacks, 'default');
    assert.deepStrictEqual(p.betas, ['server-side-fallback-2026-07-01']);
    assert.strictEqual(p.output_config.format.type, 'json_schema');
    assert.ok(p.system.includes('British English'));
    assert.ok(!('thinking' in p) && !('temperature' in p));
  });

  await t('handleAi maps refusals, truncation and bad input to HTTP errors', async () => {
    await assert.rejects(server.handleAi({ kind: 'proofread', text: 'x' }, fakeClient(textReply({}, 'refusal'))), e => e.status === 422);
    await assert.rejects(server.handleAi({ kind: 'proofread', text: 'x' }, fakeClient(textReply({}, 'max_tokens'))), e => e.status === 413);
    await assert.rejects(server.handleAi({ kind: 'proofread', text: '   ' }, fakeClient(textReply({}))), e => e.status === 400);
    await assert.rejects(server.handleAi({ kind: 'other' }, fakeClient(textReply({}))), e => e.status === 400);
    await assert.rejects(server.handleAi({ kind: 'proofread', text: 'x' }, null), e => e.status === 503);
  });

  await t('the HTTP server serves the app, blocks traversal and sends security headers', async () => {
    const srv = server.createServer({ client: null, Anthropic: null });
    await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
    const { port } = srv.address();
    try {
      const status = await request(port, 'GET', '/api/status');
      assert.deepStrictEqual(JSON.parse(status.body), { ai: false, model: null });
      const index = await request(port, 'GET', '/');
      assert.strictEqual(index.status, 200);
      assert.ok(index.headers['content-security-policy'].includes("default-src 'self'"));
      assert.strictEqual(index.headers['x-content-type-options'], 'nosniff');
      assert.strictEqual((await request(port, 'GET', '/..%2fserver.js')).status, 403);
      assert.strictEqual((await request(port, 'GET', '/nope.js')).status, 404);
      assert.strictEqual((await request(port, 'POST', '/api/ai', '{bad')).status, 400);
      assert.strictEqual((await request(port, 'DELETE', '/')).status, 405);
    } finally {
      srv.close();
    }
  });

  console.log('\nArtifact build:');

  await t('build inlines everything and strips the document skeleton', () => {
    const page = build();
    assert.ok(page.startsWith('<title>Galley Proofreader</title>'));
    assert.ok(!/<!doctype|<html[\s>]|<body[\s>]|<head[\s>]/i.test(page));
    assert.ok(!page.includes('<script src='));
    assert.ok(!page.includes('href="styles.css"'));
    assert.ok(!page.includes('sw.js') && !page.includes('manifest.webmanifest'));
    assert.ok(page.includes('GalleyEngine'));
  });

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
