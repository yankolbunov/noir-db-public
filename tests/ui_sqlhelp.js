// Регрессия подсказок к SQL (sqlhelp.js) в настоящем интерфейсе. Запуск: tests/run_ui_tests.py (нужны dev-сервер и тестовая база shop).
// 1) правильные запросы – проверка до запуска (sqlLint) не должна ничего отмечать;
// 2) ошибочные – после выполнения должна найтись правка, а «Исправить весь запрос» – дать запрос, который выполняется.
window.__result = null;
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms));
  await sl(1500);
  if (!S.info[S.active]) { await selectConn(S.conns[0].id); await sl(1200); }
  await loadMeta(S.active);
  const c = S.active;
  const good = [
    'select * from orders', 'SELECT o.id, c.city FROM orders o JOIN customers c ON c.id = o.customer_id',
    "select status, count(*) from orders group by status having count(*) > 10 order by 2 desc",
    "select date_trunc('month', created_at) m, sum(delivery_cost) from orders group by 1",
    'with t as (select customer_id, count(*) n from orders group by 1) select * from t where n > 3',
    "select * from products where name ilike '%book%' limit 10", 'select avg(price)::numeric(10,2) from products',
    "select p.name, (select count(*) from order_items oi where oi.product_id = p.id) from products p",
    'select e.full_name, m.full_name as boss from employees e left join employees m on m.id = e.manager_id',
    "select case when price > 50000 then 'дорого' else 'норм' end as cls, count(*) from products group by 1",
    'select distinct city from customers order by city', 'select * from v_monthly_sales',
    "select extract(year from created_at) y, count(*) from orders group by 1", 'select coalesce(manager_id, 0) from employees',
    "select id, row_number() over (partition by status order by created_at) from orders", 'select 1; select 2',
    "select * from orders where created_at between '2024-01-01' and '2024-02-01'", "select now()::date - interval '7 days'",
    'select count(distinct customer_id) from orders', "select name from categories where parent_id is null",
  ];
  const bad = [
    'select fll_name from employees', 'select * from oders', 'select name, count(*) from products',
    'select o.id, c.city from orders o', 'select id from orders join customers on customers.id = orders.customer_id',
    "select * from orders where status = delivered", 'select * from products where price > 1000 order by nme',
    "select * form orders", 'select sum(name) from categories', "select * from orders where created_at > '2024-13-01'",
    'select count(* from orders', 'select * from employees where manager_id = null',
  ];
  const out = { lintFalse: [], noFix: [], fixNotRunnable: [], fixed: 0 };
  for (const q of good) { const m = sqlLint(q, c); if (m.length) out.lintFalse.push(q + ' → ' + m.map(x => x.msg.replace(/<[^>]+>/g, '')).join('; ')); }
  for (const q of bad) {
    S.tabs.slice().forEach(x => forceCloseTab(x.id));
    newQueryTab(q); const tab = curTab(); await sl(100);
    await runQuery(tab); await sl(200);
    const d = tab.diag;
    if (!tab.result || !tab.result.error) continue;            // выполнился без ошибки – не наш случай
    if (!d || !(d.fixAll || d.fixes.length)) { out.noFix.push(q + ' → ' + tab.result.error); continue; }
    const fixedText = sqApplyText(d.text, (d.fixAll || d.fixes[0]).edits);
    try { await api('check_sql', c, fixedText); out.fixed++; } catch (e) { out.fixNotRunnable.push(q + ' → ' + fixedText + ' → ' + e.message); }
  }
  out.good = good.length; out.bad = bad.length;
  window.__result = JSON.stringify(out);
})();
1
