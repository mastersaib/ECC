/**
 * Tests for the Galley Android app (examples/proofreader/android and the
 * mobile web bundle). The Android SDK is not needed: these check the
 * project's configuration, the native glue's contracts and the bundle.
 *
 * Run with: node tests/examples/proofreader-mobile.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', 'examples', 'proofreader');
const ANDROID = path.join(ROOT, 'android', 'app', 'src', 'main');
const JAVA = path.join(ANDROID, 'java', 'io', 'github', 'mastersaib', 'galley');
const AI = require(path.join(ROOT, 'public', 'lib', 'ai'));

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function test(name, fn) {
  try {
    const skipped = await fn();
    console.log(`  ${skipped === 'skip' ? '-' : '✓'} ${name}${skipped === 'skip' ? ' (skipped here)' : ''}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function activityBlock(manifest, name) {
  const match = manifest.match(new RegExp(`<activity[^>]*android:name="\\.${name}"[\\s\\S]*?</activity>`));
  assert.ok(match, `${name} is declared`);
  return match[0];
}

async function runTests() {
  console.log('\n=== Testing Galley Android app ===\n');
  let passed = 0;
  let failed = 0;
  const t = async (name, fn) => ((await test(name, fn)) ? passed++ : failed++);

  console.log('Configuration:');

  await t('capacitor.config targets the mobile bundle with a permanent app id', () => {
    const cfg = JSON.parse(read('capacitor.config.json'));
    assert.strictEqual(cfg.appId, 'io.github.mastersaib.galley');
    assert.match(cfg.appId, /^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/);
    assert.strictEqual(cfg.webDir, 'mobile/www');
    assert.strictEqual(cfg.android.webContentsDebuggingEnabled, false);
    assert.ok(!cfg.plugins.Keyboard, 'SystemBars handles the keyboard on Android');
    assert.strictEqual(cfg.plugins.SystemBars.insetsHandling, 'css');
  });

  await t('Capacitor never logs plugin calls (the API key passes through them)', () => {
    const cfg = JSON.parse(read('capacitor.config.json'));
    assert.strictEqual(cfg.loggingBehavior, 'none');
    assert.ok(!cfg.android.loggingBehavior, 'no Android override turns logging back on');
  });

  await t('old WebViews get an update page instead of a broken app', () => {
    const cfg = JSON.parse(read('capacitor.config.json'));
    assert.ok(cfg.android.minWebViewVersion >= 100, 'the bundled SDK targets Chrome 100');
    assert.ok(read('scripts/build-mobile.js').includes(`'${cfg.server.errorPath}'`), 'build-mobile.js writes the error page');
  });

  await t('Gradle app id, namespace and SDK levels match Play requirements', () => {
    const gradle = read('android/app/build.gradle');
    assert.ok(gradle.includes('applicationId "io.github.mastersaib.galley"'));
    assert.ok(gradle.includes('namespace = "io.github.mastersaib.galley"'));
    const vars = read('android/variables.gradle');
    assert.ok(Number(vars.match(/targetSdkVersion = (\d+)/)[1]) >= 36, 'Play requires API 36 since August 31, 2026');
    assert.ok(Number(vars.match(/minSdkVersion = (\d+)/)[1]) >= 23, 'PROCESS_TEXT needs API 23');
  });

  await t('release signing only comes from the environment', () => {
    const gradle = read('android/app/build.gradle');
    assert.ok(gradle.includes('System.getenv("GALLEY_KEYSTORE_PATH")'));
    assert.ok(!/storePassword\s+["']/.test(gradle), 'no literal passwords');
    const tracked = fs.readdirSync(path.join(ROOT, 'android', 'app')).filter(f => /\.(jks|keystore|p12)$/.test(f));
    assert.deepStrictEqual(tracked, []);
  });

  await t('package versions are pinned exactly', () => {
    const pkg = JSON.parse(read('package.json'));
    for (const [name, version] of Object.entries(Object.assign({}, pkg.dependencies, pkg.devDependencies))) {
      assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is pinned`);
    }
    assert.strictEqual(pkg.engines.node, '>=22');
  });

  console.log('\nManifest and native code:');

  await t('the text-selection menu entry returns results to the caller', () => {
    const block = activityBlock(read('android/app/src/main/AndroidManifest.xml'), 'ProcessTextActivity');
    assert.ok(block.includes('android.intent.action.PROCESS_TEXT'));
    assert.ok(block.includes('android:mimeType="text/plain"'));
    assert.ok(block.includes('android:launchMode="standard"'), 'singleTask would cancel the result');
    assert.ok(block.includes('android:exported="true"'));
  });

  await t('the share target lives on the singleTask main activity', () => {
    const block = activityBlock(read('android/app/src/main/AndroidManifest.xml'), 'MainActivity');
    assert.ok(block.includes('android.intent.action.SEND'));
    assert.ok(block.includes('android:launchMode="singleTask"'));
  });

  await t('the encrypted key file is excluded from backup and device transfer', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    assert.ok(manifest.includes('android:fullBackupContent="@xml/backup_rules"'));
    assert.ok(manifest.includes('android:dataExtractionRules="@xml/data_extraction_rules"'));
    const prefs = fs.readFileSync(path.join(JAVA, 'SecureKeyPlugin.java'), 'utf8').match(/PREFS = "([^"]+)"/)[1];
    for (const file of ['backup_rules.xml', 'data_extraction_rules.xml']) {
      const xml = fs.readFileSync(path.join(ANDROID, 'res', 'xml', file), 'utf8');
      assert.ok(xml.includes(`path="${prefs}.xml"`), `${file} excludes ${prefs}.xml`);
    }
    assert.strictEqual((fs.readFileSync(path.join(ANDROID, 'res', 'xml', 'data_extraction_rules.xml'), 'utf8').match(/<exclude /g) || []).length, 2);
  });

  await t('a restarted activity never imports its intent again', () => {
    const main = fs.readFileSync(path.join(JAVA, 'MainActivity.java'), 'utf8');
    const process = fs.readFileSync(path.join(JAVA, 'ProcessTextActivity.java'), 'utf8');
    for (const [name, src] of [['MainActivity', main], ['ProcessTextActivity', process]]) {
      const mark = src.indexOf('IncomingTextPlugin.markConsumed(');
      assert.ok(mark > 0 && mark < src.indexOf('super.onCreate(savedInstanceState)'), `${name} marks the intent before the bridge replays it`);
      assert.ok(/savedInstanceState != null/.test(src), `${name} checks for a restart`);
    }
    assert.ok(main.includes('FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY'));
    assert.ok(/public void onSaveInstanceState\(Bundle outState\)/.test(process), 'BridgeActivity declares it public');
  });

  await t('only the cache export folder is shared through the FileProvider', () => {
    const xml = fs.readFileSync(path.join(ANDROID, 'res', 'xml', 'file_paths.xml'), 'utf8');
    assert.deepStrictEqual([...xml.matchAll(/<([a-z-]+-path)\b/g)].map(m => m[1]), ['cache-path']);
    assert.ok(read('public/js/native.js').includes("path: `exports/${safeName}`"));
  });

  await t('the splash theme applies the icon background', () => {
    const styles = fs.readFileSync(path.join(ANDROID, 'res', 'values', 'styles.xml'), 'utf8');
    assert.ok(styles.includes('parent="Theme.SplashScreen.IconBackground"'));
  });

  await t('local plugins are registered before the bridge is created', () => {
    for (const file of ['MainActivity.java', 'ProcessTextActivity.java']) {
      const src = fs.readFileSync(path.join(JAVA, file), 'utf8');
      const register = src.indexOf('registerPlugin(IncomingTextPlugin.class)');
      const key = src.indexOf('registerPlugin(SecureKeyPlugin.class)');
      const sup = src.indexOf('super.onCreate(savedInstanceState)');
      assert.ok(register > 0 && key > 0 && sup > register && sup > key, `${file} registers first`);
    }
  });

  await t('Android sources contain no invisible or byte-order-mark characters', () => {
    // The repository's unicode check does not scan .java, .xml or .gradle files.
    const files = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['build', 'assets', '.gradle'].includes(entry.name)) walk(full);
        } else if (/\.(java|kt|xml|gradle|properties)$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    walk(path.join(ROOT, 'android'));
    assert.ok(files.length > 10);
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(!/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/.test(text), `${path.relative(ROOT, file)} has an invisible character`);
      if (file.endsWith('.java')) assert.ok(!/[^\t\n\r\x20-\x7E]/.test(text), `${path.relative(ROOT, file)} is printable ASCII`);
    }
  });

  await t('the API key is sealed with AES-GCM under a non-exportable Keystore key', () => {
    const src = fs.readFileSync(path.join(JAVA, 'SecureKeyPlugin.java'), 'utf8');
    assert.ok(src.includes('"AndroidKeyStore"'));
    assert.ok(src.includes('AES/GCM/NoPadding'));
    assert.ok(src.includes('setRandomizedEncryptionRequired(true)'));
    assert.ok(!/Log\.|System\.out|Logger\./.test(src), 'the key is never logged');
  });

  await t('every plugin the page calls exists natively', () => {
    const native = read('public/js/native.js');
    const called = [...native.matchAll(/plugin\('([A-Za-z]+)'\)/g)].map(m => m[1]);
    const javaNames = fs.readdirSync(JAVA).map(f => (fs.readFileSync(path.join(JAVA, f), 'utf8').match(/@CapacitorPlugin\(name = "([^"]+)"\)/) || [])[1]).filter(Boolean);
    const pkg = JSON.parse(read('package.json'));
    const official = { App: '@capacitor/app', Filesystem: '@capacitor/filesystem', Share: '@capacitor/share' };
    for (const name of called) {
      assert.ok(javaNames.includes(name) || pkg.dependencies[official[name]], `${name} is provided`);
    }
  });

  console.log('\nWeb layer:');

  await t('native.js does nothing in a browser', () => {
    const context = { window: {}, document: {} };
    context.window.window = context.window;
    vm.runInNewContext(read('public/js/native.js'), context);
    assert.strictEqual(context.window.GalleyNative, undefined);
  });

  await t('native.js treats a missing plugin as absent (no registerPlugin without core JS)', () => {
    const src = read('public/js/native.js');
    assert.ok(!/registerPlugin\(/.test(src));
    const added = [];
    const context = {
      window: { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }, addEventListener: (name) => added.push(name) },
      document: { documentElement: { classList: { add() {} } } }
    };
    context.window.window = context.window;
    vm.runInNewContext(src, context);
    assert.strictEqual(context.window.GalleyNative.platform, 'ios');
    assert.deepStrictEqual(added, ['galley:ready']);
  });

  await t('a full store refuses to create a document instead of pretending', async () => {
    const context = {
      localStorage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} }
    };
    vm.runInNewContext(read('public/js/store.js'), context);
    const store = context.GalleyStore.createLocalStore();
    await assert.rejects(store.createDoc({ title: 'Selection', text: 'x' }), /storage for Galley is full/);
  });

  await t('the shared request builder sends the agreed Claude request', () => {
    const req = AI.buildRequest({ system: 'S', user: 'U' }, AI.ISSUES_SCHEMA);
    assert.strictEqual(req.model, 'claude-opus-5-5');
    assert.strictEqual(req.fallbacks, 'default');
    assert.deepStrictEqual(req.betas, ['server-side-fallback-2026-07-01']);
    assert.strictEqual(req.output_config.format.schema, AI.ISSUES_SCHEMA);
    assert.deepStrictEqual(req.messages, [{ role: 'user', content: 'U' }]);
  });

  await t('readMessage refuses to parse refusals and truncated replies', () => {
    assert.throws(() => AI.readMessage({ stop_reason: 'refusal', content: [] }), e => e.code === 'refused');
    assert.throws(() => AI.readMessage({ stop_reason: 'max_tokens', content: [] }), e => e.code === 'too_long');
    assert.deepStrictEqual(AI.readMessage({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"issues":[]}' }] }), { issues: [] });
  });

  await t('the mobile bundle drops Google Fonts and the service worker and bundles the SDK', async () => {
    let builder;
    try {
      require.resolve('esbuild', { paths: [ROOT] });
      require.resolve('@fontsource/literata/package.json', { paths: [ROOT] });
      builder = require(path.join(ROOT, 'scripts', 'build-mobile.js'));
    } catch (_err) {
      return 'skip';
    }
    await builder.main();
    const out = builder.OUT;
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html));
    assert.ok(html.includes('href="fonts/fonts.css"'));
    assert.ok(!fs.existsSync(path.join(out, 'sw.js')));
    assert.ok(!fs.existsSync(path.join(out, 'js', 'offline.js')));
    assert.ok(fs.statSync(path.join(out, 'vendor', 'anthropic-sdk.js')).size > 100000);
    assert.ok(html.startsWith('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy"'), 'the policy is the first thing after the charset');
    assert.ok(/connect-src 'self' https:\/\/api\.anthropic\.com;/.test(builder.CSP));
    assert.ok(/script-src 'self';/.test(builder.CSP));
    assert.ok(fs.existsSync(path.join(out, 'update-webview.html')));
    const css = fs.readFileSync(path.join(out, 'fonts', 'fonts.css'), 'utf8');
    for (const family of ['Literata', 'Source Sans 3', 'IBM Plex Mono']) assert.ok(css.includes(`'${family}'`), family);
    for (const m of css.matchAll(/url\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(out, 'fonts', m[1])), m[1]);
    return undefined;
  });

  await t('lint findings become readable annotations', () => {
    const { parseLintXml, annotation, summaryTable } = require(path.join(ROOT, 'scripts', 'report-lint.js'));
    const xml = `<issues format="6" by="lint 8.13.0">
    <issue id="HardcodedText" severity="Warning" message="Hardcoded string &quot;Galley&quot;, use a resource&#xA;instead" category="I18N">
        <location file="/w/examples/proofreader/android/app/src/main/AndroidManifest.xml" line="12" column="5"/>
    </issue>
    <issue id="NoLocation" severity="Error" message="100% broken, really">
    </issue>
</issues>`;
    const issues = parseLintXml(xml);
    assert.strictEqual(issues.length, 2);
    assert.strictEqual(issues[0].message, 'Hardcoded string "Galley", use a resource\ninstead');
    assert.strictEqual(issues[0].line, 12);
    assert.strictEqual(
      annotation(issues[0], '/w'),
      '::warning file=examples/proofreader/android/app/src/main/AndroidManifest.xml,title=Android lint%3A HardcodedText,line=12::Hardcoded string "Galley", use a resource%0Ainstead'
    );
    assert.strictEqual(annotation(issues[1], '/w'), '::error title=Android lint%3A NoLocation::100%25 broken, really');
    assert.ok(summaryTable(issues, '/w').includes('| Warning | HardcodedText | examples/proofreader/android/app/src/main/AndroidManifest.xml:12 |'));
  });

  await t('the Android workflow follows the repository CI rules', () => {
    const yml = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'galley-android.yml'), 'utf8');
    for (const m of yml.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${m[1]} pinned by SHA`);
    assert.ok(/npm ci --ignore-scripts/.test(yml));
    assert.ok(/persist-credentials: false/.test(yml));
    assert.ok(/permissions:\s*\n\s*contents: read/.test(yml));
    assert.ok(/push:\s*\n(?:\s*#.*\n)*\s*branches: \['\*\*'\]/.test(yml), 'tag pushes do not trigger it');
    assert.ok(/set -euo pipefail\n[\s\S]*apksigner/.test(yml), 'a failed apksigner verify fails the step');
    assert.ok(!/continue-on-error/.test(yml), 'lint errors fail the build');
  });

  await t('the Gradle wrapper JAR and distribution are pinned to official checksums', () => {
    const yml = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'galley-android.yml'), 'utf8');
    const jar = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar'))).digest('hex');
    assert.ok(yml.includes(`echo "${jar}  gradle/wrapper/gradle-wrapper.jar" | sha256sum --check --strict`), 'CI checks the committed JAR');
    const props = read('android/gradle/wrapper/gradle-wrapper.properties');
    assert.match(props, /^distributionSha256Sum=[0-9a-f]{64}$/m);
    assert.ok(props.includes('gradle-8.14.3-all.zip'));
  });

  await t('the signing-key helper refuses to write inside a git repository', () => {
    if (process.platform === 'win32') return 'skip';
    const target = path.join(ROOT, 'should-not-exist.p12');
    const run = spawnSync('bash', [path.join(ROOT, 'scripts', 'create-signing-key.sh'), target], { encoding: 'utf8', input: '' });
    assert.strictEqual(run.status, 1);
    assert.match(run.stderr, /inside a git repository/);
    assert.ok(!fs.existsSync(target));
    assert.match(read('.gitignore'), /^\*\.p12$/m);
    return undefined;
  });

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
