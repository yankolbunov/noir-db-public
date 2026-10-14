# Noir DB

**A macOS client for PostgreSQL focused on SQL and data analysis.**

Noir DB combines a smart SQL editor, safe transactional table editing and built-in analytics tools: charts, pivot tables and result comparison. It has a native Apple-style interface with dark and light themes. Built with Python, pywebview and plain HTML/CSS/JS, with no frameworks.

The interface is available in English and Russian (Settings → Appearance → Language).

## Download and run

Requirements: macOS on Apple Silicon (M1 or newer) and a PostgreSQL server (local or remote).

1. Download `NoirDB-*.zip` from the [Releases](../../releases) page and unzip it.
2. Drag **Noir DB.app** to *Applications*.
3. The app is not notarized by Apple, so on first launch macOS will block it. **Right-click the app → Open → Open.** If it still refuses, go to *System Settings → Privacy & Security → Open Anyway*.
4. Add a connection to your PostgreSQL server. Passwords are stored in the macOS Keychain.

**Sample databases.** Two demo databases with made-up data are included: `demo/noir_shop.sql` (an online shop) and `demo/noir_university.sql` (a university with faculties, students, grades and payments). To load one in the app, click **•••** next to the database picker → *New database*, then *Import SQL* → choose the file.

## Features

### SQL editor
- Syntax highlighting, line numbers, and the line with an error highlighted.
- **Run the statement under the cursor** (⌘↵), or the whole script (⇧⌘↵).
- **Autocomplete** for tables, columns (including through aliases like `o.`), keywords and functions.
- **JOIN suggestions based on foreign keys.** After `JOIN`, related tables come first, complete with an alias and the `ON` condition.
- **Value hints.** After `status = '` or `IN ('`, the editor suggests real values from the column.
- **Snippets** for common analytics queries: top-N, monthly totals, share of total, running totals, ranking, duplicates, CTEs. Columns are picked automatically based on the data.
- **Error assistant.** Mistakes are underlined and explained in plain language, with a corrected query applied in one click. It handles typos in names, missing `GROUP BY` columns, ambiguous columns, undeclared aliases and more. Common problems are caught while you type, before you run the query.
- **Variables** `{{name}}`. Input fields appear above the result, and values are passed safely as parameters.
- SQL formatting (⇧⌘F), find and replace (⌘F), and toggling comments (⌘/).
- **Transactions.** In *Auto* mode every query is committed at once. In *Manual* mode changes wait for *Commit* or *Roll back*.
- Query history, saved queries, `.sql` files, and tabs that are restored after restart.

### Data
- Browse tables with sorting, full-text search, column filters and pagination.
- **Inline editing**, as in a spreadsheet. Changed, new and deleted rows are highlighted and saved together **in a single transaction**: either everything is saved or nothing is.
- Editing a foreign-key column shows a searchable list of rows from the referenced table.
- Clickable foreign keys open the related row. *Where used* shows which rows reference the current one.
- **Column statistics**: count, nulls, distinct values, min, max, average, median, top values and a histogram.
- Cell selection shows sum, average, min, max and count. Copied data pastes cleanly into Excel, Numbers, Notes, Word and messengers.
- **Search a value across the whole database.**
- Import from CSV and Excel (`.xlsx`), into an existing table or as a new one with column types detected automatically.

### Analytics
- **Charts**: line, bar, pie, histogram and scatter.
- **Pivot tables**, calculated by PostgreSQL on the full result.
- **Result comparison.** Pin a result as a baseline, change the query and see which rows were added, removed or changed.
- Export to CSV and Excel (with the chart on a separate sheet) and the chart as PNG.
- Save a result as a live query, as a table snapshot in the database, or as a database **view**.

### Structure
- A table designer for creating and changing tables: types, keys, required and unique fields, defaults and comments. All changes run in one transaction, and you can preview the SQL first.
- Read-only structure view: columns, relationships, indexes and DDL.
- **Database diagram** that shows tables and their relationships.
- Create, import and drop databases.

### Safety
- **Read-only connections**, enforced by PostgreSQL itself.
- Warnings for `UPDATE` or `DELETE` without `WHERE`, and confirmation before destructive commands.
- Query timeout and query cancellation.
- Color labels for connections, for example red for production.
- **SSH tunnels**, with key or password sign-in.
- Automatic reconnection after sleep.
- Clear, human-readable error messages instead of raw PostgreSQL errors.

### Interface
- Native macOS look: dark, light or system theme, plus an optional *Liquid Glass* style.
- Resizable and auto-fitting columns, and per-column text alignment.
- Works at window sizes down to 900×560.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| ⌘ ↵ | Run the statement under the cursor (or the selection) |
| ⇧ ⌘ ↵ | Run the whole script |
| ⌘ S | Save table changes or the query |
| ⌘ T | New query |
| ⇧ ⌘ F | Format SQL |
| ⌘ F | Find and replace |
| ⌘ / | Toggle comment |
| ⌘ C | Copy selected cells |
| Ctrl Space | Show suggestions |

## Build from source

You need Python 3.9 or newer. Right-click `Установить Noir DB.command` (*Install Noir DB*) → Open. The script creates a virtual environment, installs the dependencies, builds the app with PyInstaller and copies it to *Applications*.

For development, run `python3 dev/dev_server.py` to open the interface in a browser with a real database. To run the tests: `python -m unittest discover -s tests`.

### Project structure

```
app/
  main.py        app window (pywebview) and macOS integration
  server.py      local HTTP API on 127.0.0.1, protected by a token
  api.py         API methods called by the UI and readable errors
  db.py          all PostgreSQL work (psycopg 3)
  store.py       connections, settings and history (passwords in the Keychain)
  exporters.py   CSV and Excel export
  tablefile.py   CSV and Excel import, type detection
  sshtunnel.py   SSH tunnels through the system ssh
  ui/            interface: plain JavaScript, HTML and CSS
demo/            sample databases
dev/             dev server, demo data and icon generators
tests/           automated tests
```

Settings and connections are stored in `~/Library/Application Support/NoirDB/`. Passwords are kept in the macOS Keychain.

## License

MIT, see [LICENSE](LICENSE). Author: Yan Kolbunov.

---

## По-русски

**Noir DB** – клиент PostgreSQL для macOS с упором на SQL и анализ данных:
- умный редактор с автодополнением, подсказками JOIN и исправлением ошибок в один клик;
- правка таблиц в транзакциях;
- графики, сводные таблицы и сравнение результатов;
- импорт CSV и Excel;
- SSH-туннели.

Интерфейс на русском и английском, тёмная и светлая тема.

**Как установить.** Нужен Mac с чипом Apple (M1 или новее).
1. На странице [Releases](../../releases) скачай `NoirDB-*.zip` и распакуй его.
2. Перетащи **Noir DB.app** в «Программы».
3. Приложение не заверено Apple, поэтому при первом запуске нажми **правый клик → «Открыть» → «Открыть»**. Если не пускает: «Системные настройки → Конфиденциальность и безопасность → Всё равно открыть».

Демо-базы для тренировки лежат в папке `demo`. Чтобы загрузить: «•••» рядом с выбором базы → «Новая база», затем «Импорт SQL».

Разработчик – Ян Колбунов, © 2026.
