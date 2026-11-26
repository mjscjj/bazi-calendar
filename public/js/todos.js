// 待办跟随日卡选中的日期。更新清单时保留输入框，便于连续添加。
import { $, api, esc, onClick, openSheet, toast } from './core.js';
import { S, isDemo } from './state.js';

function listHtml(items) {
  return items.map((t) => `<li><label><input type="checkbox" data-todo-check="${t.id}"${t.done ? ' checked' : ''}><span>${esc(t.text)}</span></label>`
    + `<button type="button" data-todo-remove="${t.id}" aria-label="删除待办：${esc(t.text)}">×</button></li>`).join('');
}
function historyControl(items) {
  const count = items.filter(t => t.done).length;
  return count ? `<button type="button" class="todo-history" data-todo-history aria-haspopup="dialog" aria-label="待办历史，已完成 ${count} 项">历史 <span>${count}</span> ›</button>` : '';
}

function archiveHtml(items) {
  const done = items.filter(t => t.done);
  return done.length
    ? `<p class="archive-note">取消勾选即可恢复到当天的待办。</p><ul class="todo-list" aria-label="已完成的待办">${listHtml(done)}</ul>`
    : '<p class="archive-note">当天没有已完成的待办。</p>';
}

export function todosHtml(day, items = [], title) {
  const add = isDemo()
    ? '<button type="button" class="todo-guest" data-demo-tip="添加并保存待办">＋ 添加待办</button>'
    : '<form class="todo-add"><input name="task" maxlength="120" autocomplete="off" placeholder="添加一件待办…" aria-label="待办内容" required><button type="submit" class="btn sm ghost">添加</button></form>';
  return `<div class="todos" data-todo-day="${day}"><div class="q"><h2>${title}</h2><span class="history-slot">${historyControl(items)}</span></div>${add}<ul class="todo-list" aria-label="未完成的待办">${listHtml(items.filter(t => !t.done))}</ul></div>`;
}

const weeks = () => [S.today?.strip, ...Object.values(S.wcache || {})].filter(Boolean);
onClick('[data-todo-history]', (button) => {
  const day = button.closest('.todos').dataset.todoDay;
  const items = weeks().flatMap(week => week.days).find(entry => entry.date === day)?.todos || [];
  const [, month, date] = day.split('-').map(Number);
  openSheet(`${month}月${date}日 · 待办历史`, `<div class="todo-archive" data-todo-day="${day}">${archiveHtml(items)}</div>`, {
    onClose: () => ($(`.todos[data-todo-day="${day}"] [data-todo-history]`) || $(`.todos[data-todo-day="${day}"] input`))?.focus({ preventScroll: true })
  });
  $('#sheet [data-close-sheet]').focus({ preventScroll: true });
});

function updateList(day, id, todo) {
  let items;
  for (const week of weeks()) {
    const entry = week?.days.find((d) => d.date === day);
    if (!entry) continue;
    items = (entry.todos || []).filter((t) => t.id !== id);
    if (todo) items.push(todo);
    entry.todos = items.sort((a, b) => a.id - b.id);
  }
  if (!items) return;
  const main = $(`.todos[data-todo-day="${day}"]`);
  if (main) {
    $('.todo-list', main).innerHTML = listHtml(items.filter(t => !t.done));
    $('.history-slot', main).innerHTML = historyControl(items);
  }
  const archive = $(`.todo-archive[data-todo-day="${day}"]`);
  if (archive) archive.innerHTML = archiveHtml(items);
}

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!form.matches('.todo-add')) return;
  event.preventDefault();
  const field = form.elements.task, text = field.value.trim(), submit = $('button', form);
  if (submit.disabled || !text) return;
  const day = form.closest('.todos').dataset.todoDay;
  if (form.dataset.lastText !== text) {
    form.dataset.key = crypto.randomUUID();
    form.dataset.lastText = text;
  }
  submit.disabled = true;
  field.readOnly = true;
  try {
    const { todo } = await api('POST', 'todos', { day, text, key: form.dataset.key });
    updateList(day, todo.id, todo);
    field.value = '';
    delete form.dataset.lastText;
    if (form.isConnected) field.focus();
  } catch (err) { toast(err.message); }
  finally { field.readOnly = false; submit.disabled = false; }
});

document.addEventListener('change', async ({ target }) => {
  if (!target.matches('[data-todo-check]')) return;
  const done = target.checked, scope = target.closest('[data-todo-day]'), day = scope.dataset.todoDay;
  target.disabled = true;
  try {
    const { todo } = await api('PUT', 'todos/' + target.dataset.todoCheck, { done });
    const hadFocus = document.activeElement === target;
    updateList(day, todo.id, todo);
    if (hadFocus) ($('[data-todo-check]', scope) || $('[data-todo-history]', scope) || $('#sheet [data-close-sheet]'))?.focus({ preventScroll: true });
  } catch (err) { target.checked = !done; target.disabled = false; toast(err.message); }
});
onClick('[data-todo-remove]', async (button) => {
  const id = Number(button.dataset.todoRemove), day = button.closest('[data-todo-day]').dataset.todoDay;
  if (!confirm('删除这条待办？')) return;
  button.disabled = true;
  try {
    await api('DELETE', 'todos/' + id, {});
    updateList(day, id, null);
  } catch (err) { button.disabled = false; toast(err.message); }
});
