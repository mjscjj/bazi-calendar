// 几个走查共用的小动作：填出生信息、转滚轮。

// 出生日期、时间在页面上是滚轮选的；不测滚轮的地方直接写进隐藏字段
export const setBirth = (p, date, time) => p.evaluate(([date, time]) => {
  const f = document.querySelector('#bForm, #pForm'), el = f.elements;
  el.cal.value = 'solar'; el.date.value = date;
  if (time) { el.time.value = time; el.notime.checked = false; }
  f.dispatchEvent(new Event('birthset'));
}, [date, time]);

// 把弹层里第 i 列滚轮转到第 k 项（每项 40px），等它停下
export async function wheel(p, i, k) {
  await p.evaluate(([i, k]) => { const c = document.querySelectorAll('#sheet .wcol')[i]; c.scrollTop = k * 40; c.dispatchEvent(new Event('scroll')); }, [i, k]);
  await p.waitForTimeout(220);
}
// 真实触摸（CDP）：手指在第 i 列滚轮上竖着拖 dy 像素（正数往下拖＝往回滚）
export async function touchWheel(p, i, dy) {
  const b = await p.evaluate((i) => { const r = document.querySelectorAll('#sheet .wcol')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
  const s = await p.context().newCDPSession(p);
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y - dy / 2 }] });
  for (let k = 1; k <= 10; k++) { await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: b.y - dy / 2 + (dy * k) / 10 }] }); await p.waitForTimeout(16); }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await s.detach();
  await p.waitForTimeout(700);
}
export const wheelOn =(p, i) => p.evaluate((i) => document.querySelectorAll('#sheet .wcol')[i].querySelector('.witem.on').textContent, i);


// 每日一签走到底：写下所问 → 回车（跳过按住三秒）→ 点摇签 → 等星盘起签 → 掷筊直到圣杯 → 看签文。
// 本地服务端用 JIAO_FAKE=xiao,sheng 启动时第 2 次是圣杯；线上是真随机，传 { real: true } 时求不成也算走通，返回 false。
export async function drawLot(p, question = '', { real = false } = {}) {
  await p.waitForSelector('#sheet #drawForm');
  if (question) await p.fill('#drawForm input[name=q]', question);
  await p.press('#drawForm input[name=q]', 'Enter');
  await p.click('#sheet [data-shake]');
  await p.waitForSelector('#sheet [data-toss]', { timeout: 20000 });
  for (let i = 0; i < 3; i++) {
    await p.click('#sheet [data-toss]');
    await p.waitForSelector('#sheet [data-jiao-read], #sheet [data-toss]:not([disabled]), #sheet #reaskForm, #sheet .rit.p-closed', { timeout: 10000 });
    if (await p.$('#sheet [data-jiao-read]')) { await p.click('#sheet [data-jiao-read]'); await p.waitForSelector('#sheet .rit.p-lot .rpoem'); return true; }
    if (await p.$('#sheet #reaskForm, #sheet .rit.p-closed')) {
      if (real) return false;
      throw new Error('掷筊没求成（服务端启动时加 JIAO_FAKE=xiao,sheng）');
    }
  }
  return false;
}
