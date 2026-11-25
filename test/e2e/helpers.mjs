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

