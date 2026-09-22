/* 엔진 검증: 모든 예제 회로를 파싱 · 시뮬레이션하고 검사식(!)을 확인한다
 *   node tools/test.js            모든 예제
 *   node tools/test.js 555        제목에 '555' 가 들어간 예제만
 *   node tools/test.js -v         자세히
 */
const path = require('path');
const CS = require(path.join(__dirname, '../js/sim/engine.js'));
const { EXAMPLES } = require(path.join(__dirname, '../js/examples.js'));

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const filt = args.filter((a) => a[0] !== '-')[0];
let fail = 0, total = 0;

function smoke(ex) {
  // 파싱 → 텍스트 → 다시 파싱이 같은 회로인가
  const c1 = CS.parse(ex.text);
  const t1 = CS.serialize(c1);
  const t2 = CS.serialize(CS.parse(t1));
  if (t1 !== t2) return '직렬화가 안정적이지 않습니다';
  // 1초 동안 돌려서 NaN · 예외가 없는가
  const sim = new CS.Sim(CS.parse(ex.text));
  const sp = sim.autoSpeed();
  for (let k = 0; k < 30; k++) sim.run(sp / 30, 1e9);
  sim.computeCurrents();
  const bad = sim.nets.find((n) => n.analog && !isFinite(sim.netV(n.id)));
  if (bad) return `넷 ${bad.id} 전압이 NaN`;
  if (verbose) console.log(`   mode=${sim.mode} dt=${CS.siText(sim.dt)}s t=${CS.siText(sim.t)}s nodes=${sim.nNodes} nets=${sim.nets.length} bridges=${sim.bridges.length}`);
  return '';
}

for (const ex of EXAMPLES) {
  if (filt && ex.title.indexOf(filt) < 0) continue;
  total++;
  const t0 = Date.now();
  let msg = '';
  try {
    const c = CS.parse(ex.text);
    if (c.errors.length) msg = c.errors.join(' / ');
    if (!msg) msg = smoke(ex);
    if (!msg) {
      const r = CS.runChecks(ex.text);
      const bad = r.results.filter((x) => !x.ok);
      if (verbose) r.results.forEach((x) => console.log(`   ${x.ok ? '✔' : '✖'} ${x.text} ${x.msg || ''}`));
      if (bad.length) msg = bad.map((x) => `${x.line}행 ${x.text} → ${x.msg}`).join('\n      ');
    }
  } catch (e) { msg = '예외: ' + (e.stack || e.message); }
  const ms = Date.now() - t0;
  if (msg) { fail++; console.log(`✖ [${ex.group}] ${ex.title} (${ms} ms)\n      ${msg}`); }
  else console.log(`✔ [${ex.group}] ${ex.title} (${ms} ms)`);
}
console.log(`\n${total - fail}/${total} 통과`);
process.exit(fail ? 1 : 0);
