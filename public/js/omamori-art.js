// Keep the wish keys shared with saved amulets and the exchange API.
export const embroidered = {
  平安: { title: '旅途平安', en: 'Safe Travels', fabric: '靛蓝山岚', message: '愿你一路平安，沿途都有好风景。', photo: 'travel' },
  事业: { title: '新的开始', en: 'New Beginnings', fabric: '杏色晨曦', message: '愿每一次出发，都走向你喜欢的生活。', photo: 'dawn' },
  学业: { title: '考试顺利', en: 'Exam Success', fabric: '墨绿桂枝', message: '愿你落笔从容，想起每一份努力。', photo: 'laurel' },
  姻缘: { title: '樱花良缘', en: 'Good Connections', fabric: '樱粉蕾丝', message: '愿你遇见聊得来的人，也被温柔以待。', photo: 'sakura' },
  财运: { title: '招财纳福', en: 'Prosperity', fabric: '金锦招财猫', message: '送你一只招财猫，愿你的付出都有好收获。', photo: 'cat' },
  健康: { title: '健康长乐', en: 'Good Health', fabric: '青瓷白鹤', message: '愿你吃得香、睡得好，有力气做喜欢的事。', photo: 'crane' },
  家宅: { title: '家内平安', en: 'Peace at Home', fabric: '银杏木刻', message: '愿你每次回家，都有一盏灯为你亮着。', photo: 'home' },
  厄除: { title: '月下厄除', en: 'A Fresh Start', fabric: '紫绀月纹', message: '把今天的不顺留在身后，明早再轻轻出发。', photo: 'moon' },
  胜运: { title: '旗开得胜', en: 'Victory', fabric: '群青隼羽', message: '轮到你上场了，愿你放手一搏。', photo: 'falcon' },
};
export const hangingSrc = art => photoSrc('hang-' + art.photo);
export const photoSrc = key => 'art/omamori/' + key + '.webp';
export function editionOf(a) {
  if (a.style === 'pool') return poolEditions.find(art => art.goal === a.look.goal);
  return ['deed', 'energy'].includes(a.style) ? embroidered[a.wish] : null;
}

// The same milestones drive the collection artwork and the server's one-time grants.
export const poolEditions = [
  { goal: 3000, title: '凝露', en: 'Morning Dew', photo: 'pool-dew', fabric: '青绸银露', message: '愿你细小的善意，都被温柔接住。' },
  { goal: 5000, title: '游锦', en: 'Golden Koi', photo: 'pool-koi', fabric: '靛青锦鲤', message: '愿你赠出的好意，如游鱼般自在往来。' },
  { goal: 10000, title: '金莲', en: 'Golden Lotus', photo: 'pool-lotus', fabric: '紫锦金莲', message: '愿你一路播下的善意，开成一池花。' },
];
