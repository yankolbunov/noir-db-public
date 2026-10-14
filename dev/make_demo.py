"""Генерирует demo/noir_shop.sql – демо-базу интернет-магазина электроники.
Данные одинаковые при каждом запуске (фиксированный seed), чтобы ответы к заданиям совпадали.
"""
import datetime as dt
import random
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

R = random.Random(2026)
OUT = Path(__file__).resolve().parent.parent / "demo" / "noir_shop.sql"


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, Decimal)):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def money(x):
    return Decimal(str(x)).quantize(Decimal("0.01"), ROUND_HALF_UP)


def inserts(table, cols, rows, chunk=400):
    out = []
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        vals = ",\n".join("(" + ", ".join(q(v) for v in r) + ")" for r in part)
        out.append(f"INSERT INTO {table} ({', '.join(cols)}) VALUES\n{vals};\n")
    return "".join(out)


# ---------------- категории (дерево) ----------------
CATS = [
    (1, "Компьютеры", None), (2, "Смартфоны и гаджеты", None), (3, "Аудио", None), (4, "ТВ и видео", None), (5, "Дом", None),
    (6, "Ноутбуки", 1), (7, "Мониторы", 1), (8, "Комплектующие", 1), (9, "Периферия", 1),
    (10, "Смартфоны", 2), (11, "Планшеты", 2), (12, "Умные часы", 2), (13, "Аксессуары", 2),
    (14, "Наушники", 3), (15, "Колонки", 3),
    (16, "Телевизоры", 4), (17, "Игровые консоли", 4),
    (18, "Пылесосы", 5), (19, "Кофемашины", 5), (20, "Умный дом", 5),
]

# (категория, бренд, название, цена)
PRODUCTS = [
    (6, "Apple", "MacBook Air 13 M3", 129990), (6, "Apple", "MacBook Pro 14 M4", 219990), (6, "Lenovo", "IdeaPad Slim 5", 74990),
    (6, "ASUS", "Vivobook 15", 54990), (6, "Huawei", "MateBook D16", 69990), (6, "HP", "Pavilion 15", 61990), (6, "ASUS", "ROG Strix G16", 159990),
    (6, "Lenovo", "ThinkPad E14", 89990), (6, "MSI", "Modern 14", 47990),
    (7, "Samsung", "Odyssey G5 27", 27990), (7, "LG", "UltraGear 27GP850", 34990), (7, "Xiaomi", "Mi Monitor 23.8", 11990),
    (7, "Dell", "UltraSharp U2723QE", 64990), (7, "AOC", "24G2", 15990), (7, "Huawei", "MateView SE 23.8", 12990),
    (8, "Samsung", "SSD 990 Pro 1 ТБ", 13990), (8, "Kingston", "Fury Beast 32 ГБ DDR5", 10990), (8, "NVIDIA", "GeForce RTX 4070 Super", 74990),
    (8, "AMD", "Ryzen 7 7800X3D", 42990), (8, "WD", "Blue SN580 1 ТБ", 7490), (8, "Crucial", "P3 Plus 2 ТБ", 12490),
    (9, "Logitech", "MX Master 3S", 9990), (9, "Logitech", "MX Keys S", 11990), (9, "Razer", "DeathAdder V3", 6990),
    (9, "Keychron", "K2 Pro", 9490), (9, "Logitech", "C920 веб-камера", 6490), (9, "Xiaomi", "Коврик для мыши XL", 990),
    (10, "Apple", "iPhone 16", 89990), (10, "Apple", "iPhone 16 Pro", 119990), (10, "Apple", "iPhone 15", 69990),
    (10, "Samsung", "Galaxy S25", 84990), (10, "Samsung", "Galaxy A55", 36990), (10, "Xiaomi", "Redmi Note 14 Pro", 27990),
    (10, "Xiaomi", "14T", 49990), (10, "Google", "Pixel 9", 74990), (10, "realme", "12 Pro+", 32990), (10, "HONOR", "200", 39990),
    (11, "Apple", "iPad Air 11", 69990), (11, "Apple", "iPad 10.9", 39990), (11, "Samsung", "Galaxy Tab S9 FE", 37990),
    (11, "Xiaomi", "Pad 6", 29990), (11, "HUAWEI", "MatePad 11.5", 26990),
    (12, "Apple", "Watch Series 10", 44990), (12, "Samsung", "Galaxy Watch 7", 27990), (12, "Xiaomi", "Smart Band 9", 3990),
    (12, "Huawei", "Watch GT 5", 21990), (12, "Garmin", "Forerunner 265", 44990),
    (13, "Apple", "Зарядка 20 Вт USB-C", 2490), (13, "Anker", "Powerbank 20000 мАч", 4490), (13, "Baseus", "Кабель USB-C 1 м", 690),
    (13, "Spigen", "Чехол для iPhone 16", 1990), (13, "Samsung", "Беспроводная зарядка 15 Вт", 3490), (13, "Ugreen", "Хаб USB-C 7 в 1", 3990),
    (14, "Apple", "AirPods Pro 2", 22990), (14, "Apple", "AirPods 4", 13990), (14, "Sony", "WH-1000XM5", 32990),
    (14, "Samsung", "Galaxy Buds3 Pro", 19990), (14, "JBL", "Tune 520BT", 4490), (14, "Marshall", "Major IV", 12990),
    (14, "Xiaomi", "Redmi Buds 6", 2990), (14, "Sennheiser", "Momentum 4", 29990),
    (15, "JBL", "Flip 6", 10990), (15, "JBL", "Charge 5", 14990), (15, "Яндекс", "Станция Миди", 16990),
    (15, "Яндекс", "Станция Лайт 2", 6990), (15, "Marshall", "Emberton II", 15990), (15, "Sony", "SRS-XB100", 4990),
    (16, "Samsung", "QLED 55 Q60D", 64990), (16, "LG", "OLED 55 C4", 129990), (16, "Xiaomi", "TV A Pro 55", 39990),
    (16, "Sony", "Bravia 65 X85L", 109990), (16, "Haier", "55 Smart TV S5", 42990), (16, "TCL", "50P755", 32990),
    (17, "Sony", "PlayStation 5 Slim", 54990), (17, "Microsoft", "Xbox Series S", 34990), (17, "Nintendo", "Switch OLED", 32990),
    (17, "Sony", "DualSense геймпад", 6990), (17, "Valve", "Steam Deck OLED", 64990),
    (18, "Dreame", "L10s Ultra", 64990), (18, "Xiaomi", "Robot Vacuum X20", 39990), (18, "Dyson", "V15 Detect", 69990),
    (18, "Roborock", "Q7 Max", 29990), (18, "Tefal", "X-Force Flex 9.60", 24990),
    (19, "De'Longhi", "Magnifica S", 39990), (19, "Philips", "EP2231 LatteGo", 44990), (19, "Nespresso", "Vertuo Pop", 12990),
    (19, "Krups", "Evidence One", 69990),
    (20, "Яндекс", "Умная лампочка", 990), (20, "Aqara", "Датчик протечки", 1990), (20, "Xiaomi", "Умная розетка", 1290),
    (20, "Aqara", "Хаб M2", 4990), (20, "Яндекс", "Пульт", 2490), (20, "Ezviz", "Камера C6N", 2990),
    (9, "HyperX", "Cloud III гарнитура", 9990), (13, "Apple", "MagSafe зарядка", 4990), (10, "Nothing", "Phone (2a)", 29990),
    (16, "Яндекс", "ТВ Станция 50", 39990), (12, "Amazfit", "GTR 4", 13990), (19, "Polaris", "PACM 2080AC", 22990),
]

CITIES = [("Москва", 32), ("Санкт-Петербург", 16), ("Краснодар", 9), ("Екатеринбург", 7), ("Новосибирск", 7), ("Казань", 6),
          ("Сочи", 5), ("Ростов-на-Дону", 5), ("Нижний Новгород", 4), ("Самара", 3), ("Воронеж", 3), ("Пермь", 3)]

M_FIRST = ["Александр", "Дмитрий", "Максим", "Иван", "Артём", "Никита", "Михаил", "Даниил", "Егор", "Андрей", "Кирилл", "Илья",
           "Алексей", "Роман", "Сергей", "Владимир", "Ян", "Матвей", "Тимофей", "Глеб"]
F_FIRST = ["Анастасия", "Мария", "Анна", "Виктория", "Екатерина", "Дарья", "Полина", "Алина", "Елизавета", "Ксения", "Софья",
           "Ольга", "Юлия", "Вероника", "Алёна", "Татьяна", "Ирина", "Арина", "Ева", "Варвара"]
LAST = ["Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов", "Михайлов", "Новиков", "Фёдоров", "Морозов",
        "Волков", "Алексеев", "Лебедев", "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев", "Орлов", "Андреев",
        "Макаров", "Никитин", "Захаров", "Зайцев", "Соловьёв", "Борисов", "Яковлев", "Григорьев", "Романов", "Воробьёв",
        "Сергеев", "Кузьмин", "Фролов", "Александров", "Дмитриев", "Королёв", "Гусев", "Киселёв", "Ильин", "Максимов"]

TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u",
                     "f", "kh", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def lat(s):
    return "".join(TRANSLIT.get(c, c) for c in s.lower())


def fem(last):
    return last + "а" if last.endswith(("ов", "ев", "ёв", "ин")) else last


def pick_city():
    return R.choices([c for c, _ in CITIES], weights=[w for _, w in CITIES])[0]


START = dt.date(2024, 1, 1)
END = dt.date(2026, 9, 30)


def main():
    sql = []
    sql.append("""-- ============================================================
-- Noir Shop – демо-база интернет-магазина электроники
-- Импорт: подключись к пустой базе (например, shop) и выполни этот файл целиком.
-- Файл можно запускать повторно – он сначала удаляет свои таблицы.
-- Период данных: январь 2024 – сентябрь 2026.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS v_order_totals, v_monthly_sales, v_product_stats CASCADE;
DROP TABLE IF EXISTS reviews, payments, order_items, orders, employees, customers, products, categories CASCADE;

CREATE TABLE categories (
  id         integer PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  parent_id  integer REFERENCES categories(id)
);
COMMENT ON TABLE categories IS 'Категории товаров. parent_id ссылается на родительскую категорию (дерево)';

CREATE TABLE products (
  id           serial PRIMARY KEY,
  sku          text NOT NULL UNIQUE,
  name         text NOT NULL,
  brand        text NOT NULL,
  category_id  integer NOT NULL REFERENCES categories(id),
  price        numeric(10,2) NOT NULL CHECK (price > 0),
  cost         numeric(10,2) NOT NULL CHECK (cost > 0),
  stock        integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active    boolean NOT NULL DEFAULT true,
  added_at     date NOT NULL
);
COMMENT ON TABLE products IS 'Товары. price – цена продажи, cost – закупочная цена';

CREATE TABLE customers (
  id             serial PRIMARY KEY,
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  gender         char(1) NOT NULL CHECK (gender IN ('m','f')),
  email          text NOT NULL UNIQUE,
  phone          text,
  city           text NOT NULL,
  birth_date     date,
  registered_at  timestamptz NOT NULL,
  loyalty_level  text NOT NULL DEFAULT 'bronze' CHECK (loyalty_level IN ('bronze','silver','gold'))
);
COMMENT ON TABLE customers IS 'Покупатели. loyalty_level – уровень программы лояльности';

CREATE TABLE employees (
  id          serial PRIMARY KEY,
  full_name   text NOT NULL,
  position    text NOT NULL,
  manager_id  integer REFERENCES employees(id),
  city        text NOT NULL,
  hire_date   date NOT NULL,
  salary      numeric(10,2) NOT NULL
);
COMMENT ON TABLE employees IS 'Сотрудники. manager_id – руководитель (ссылка на эту же таблицу)';

CREATE TABLE orders (
  id             serial PRIMARY KEY,
  customer_id    integer NOT NULL REFERENCES customers(id),
  employee_id    integer REFERENCES employees(id),
  created_at     timestamptz NOT NULL,
  status         text NOT NULL CHECK (status IN ('new','paid','shipped','delivered','cancelled','returned')),
  delivery_type  text NOT NULL CHECK (delivery_type IN ('courier','pickup','post')),
  delivery_city  text NOT NULL,
  delivery_cost  numeric(10,2) NOT NULL DEFAULT 0
);
COMMENT ON TABLE orders IS 'Заказы. employee_id – менеджер, который обработал заказ';

CREATE TABLE order_items (
  order_id    integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  integer NOT NULL REFERENCES products(id),
  quantity    integer NOT NULL CHECK (quantity > 0),
  price       numeric(10,2) NOT NULL,
  discount    numeric(4,2) NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount < 1),
  PRIMARY KEY (order_id, product_id)
);
COMMENT ON TABLE order_items IS 'Состав заказов. price – цена на момент покупки, discount – скидка долей (0.10 = 10%)';

CREATE TABLE payments (
  id        serial PRIMARY KEY,
  order_id  integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  paid_at   timestamptz NOT NULL,
  amount    numeric(12,2) NOT NULL,
  method    text NOT NULL CHECK (method IN ('card','sbp','cash','installment'))
);
COMMENT ON TABLE payments IS 'Оплаты. amount отрицательный – возврат денег';

CREATE TABLE reviews (
  id           serial PRIMARY KEY,
  product_id   integer NOT NULL REFERENCES products(id),
  customer_id  integer NOT NULL REFERENCES customers(id),
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         text,
  created_at   timestamptz NOT NULL
);
COMMENT ON TABLE reviews IS 'Отзывы покупателей, оценка от 1 до 5';

""")

    # ---------- категории ----------
    sql.append(inserts("categories", ["id", "name", "parent_id"], CATS))

    # ---------- товары ----------
    prows = []
    for i, (cat, brand, name, price) in enumerate(PRODUCTS, 1):
        margin = R.uniform(0.12, 0.35) if cat not in (13, 20) else R.uniform(0.35, 0.6)
        cost = money(price * (1 - margin) // 10 * 10)
        added = START + dt.timedelta(days=R.randint(0, 600)) if i > 20 else START
        stock = 0 if R.random() < 0.08 else R.randint(1, 120)
        active = not (R.random() < 0.05)
        prows.append([i, f"NS-{cat:02d}{i:04d}", name, brand, cat, money(price), cost, stock, active, added])
    sql.append(inserts("products", ["id", "sku", "name", "brand", "category_id", "price", "cost", "stock", "is_active", "added_at"], prows))

    # ---------- сотрудники ----------
    emps = [
        (1, "Орлова Марина Сергеевна", "Директор по продажам", None, "Москва", dt.date(2019, 3, 1), 320000),
        (2, "Белов Артём Игоревич", "Руководитель отдела", 1, "Москва", dt.date(2020, 6, 15), 210000),
        (3, "Захарова Ольга Петровна", "Руководитель отдела", 1, "Санкт-Петербург", dt.date(2021, 2, 1), 195000),
        (4, "Ким Денис Олегович", "Руководитель отдела", 1, "Краснодар", dt.date(2022, 9, 12), 160000),
    ]
    staff_names = ["Гусев Павел", "Лаптева Ирина", "Широков Илья", "Мельник Дарья", "Тихонов Глеб", "Руденко Алина",
                   "Карпов Никита", "Фомина Ксения", "Сафин Тимур", "Ершова Полина", "Абрамов Егор", "Носова Вера",
                   "Голубев Роман", "Литвинова Ева"]
    for j, nm in enumerate(staff_names, 5):
        mgr = [2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 2, 3][j - 5]
        city = {2: "Москва", 3: "Санкт-Петербург", 4: "Краснодар"}[mgr]
        hire = dt.date(2021, 1, 1) + dt.timedelta(days=R.randint(0, 1100))
        if j >= 17:
            hire = dt.date(2025, R.randint(2, 9), R.randint(1, 28))
        emps.append((j, nm, "Менеджер" if j < 15 else "Старший менеджер" if j < 17 else "Младший менеджер",
                     mgr, city, hire, R.randrange(75000, 130000, 5000)))
    sql.append(inserts("employees", ["id", "full_name", "position", "manager_id", "city", "hire_date", "salary"], emps))
    managers = [e for e in emps if e[3] in (2, 3, 4)]

    # ---------- покупатели ----------
    crows, used = [], set()
    for i in range(1, 641):
        g = "m" if R.random() < 0.55 else "f"
        first = R.choice(M_FIRST if g == "m" else F_FIRST)
        last = R.choice(LAST)
        last = last if g == "m" else fem(last)
        base = f"{lat(first)}.{lat(last)}"
        email = base + "@" + R.choice(["mail.ru", "yandex.ru", "gmail.com", "inbox.ru", "bk.ru"])
        n = 1
        while email in used:
            n += 1
            email = f"{base}{n}@" + email.split("@")[1]
        used.add(email)
        phone = None if R.random() < 0.07 else f"+7 9{R.randint(10, 99)} {R.randint(100, 999)}-{R.randint(10, 99)}-{R.randint(10, 99)}"
        bd = None if R.random() < 0.12 else dt.date(R.randint(1965, 2007), R.randint(1, 12), R.randint(1, 28))
        reg = START - dt.timedelta(days=R.randint(0, 700)) if i <= 180 else START + dt.timedelta(days=int((i - 180) / 460 * 990))
        reg_ts = dt.datetime.combine(reg, dt.time(R.randint(8, 23), R.randint(0, 59), R.randint(0, 59)))
        crows.append([i, first, last, g, email, phone, pick_city(), bd, reg_ts.strftime("%Y-%m-%d %H:%M:%S+03"), "bronze"])

    # ---------- заказы ----------
    # активность покупателей: у кого-то много заказов, у кого-то ни одного
    weight = {c[0]: (0 if R.random() < 0.12 else R.paretovariate(1.6)) for c in crows}
    cust_ids = [c[0] for c in crows]
    reg_date = {c[0]: dt.datetime.strptime(c[8][:19], "%Y-%m-%d %H:%M:%S").date() for c in crows}
    city_of = {c[0]: c[6] for c in crows}
    price_of = {p[0]: p[5] for p in prows}
    cat_of = {p[0]: p[4] for p in prows}
    added_of = {p[0]: p[9] for p in prows}
    # пара товаров, которые никто не купил
    never_sold = {91, 95}
    pop = {p[0]: (R.uniform(0.3, 3) * (2.5 if cat_of[p[0]] in (10, 13, 14) else 1)) for p in prows if p[0] not in never_sold}

    orders, items, pays = [], [], []
    oid = 0
    day = START
    while day <= END:
        months = (day.year - 2024) * 12 + day.month - 1
        season = {11: 1.6, 12: 2.1, 1: 0.8, 2: 0.85, 3: 1.25, 8: 1.15, 9: 1.2}.get(day.month, 1.0)
        if day.month == 11 and 24 <= day.day <= 30:
            season = 3.2            # «чёрная пятница»
        lam = (2.6 + months * 0.12) * season * (1.15 if day.weekday() >= 5 else 1)
        n = sum(1 for _ in range(int(lam * 2)) if R.random() < 0.5)
        for _ in range(n):
            cands = [c for c in R.choices(cust_ids, k=8) if reg_date[c] <= day and weight[c] > 0]
            if not cands:
                continue
            cid = max(cands, key=lambda c: weight[c] * R.random())
            oid += 1
            ts = dt.datetime.combine(day, dt.time(R.choices(range(24), weights=[1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 7, 7, 6, 6, 6, 7, 8, 9, 9, 8, 5, 3])[0],
                                                   R.randint(0, 59), R.randint(0, 59)))
            age = (END - day).days
            if age < 3:
                status = R.choice(["new", "paid", "paid", "shipped"])
            elif age < 10:
                status = R.choices(["paid", "shipped", "delivered", "cancelled"], [2, 5, 6, 1])[0]
            else:
                status = R.choices(["delivered", "cancelled", "returned"], [86, 9, 5])[0]
            dtype = R.choices(["courier", "pickup", "post"], [5, 4, 1])[0]
            dcity = city_of[cid] if R.random() < 0.94 else pick_city()
            dcost = Decimal("0.00") if dtype == "pickup" else money(R.choice([290, 390, 490]) if dtype == "courier" else 350)
            emp = R.choice([m for m in managers if m[5] <= day] or managers[:5])[0]
            if R.random() < 0.06:
                emp = None           # оформлен автоматически, без менеджера
            k = R.choices([1, 2, 3, 4, 5], [52, 27, 12, 6, 3])[0]
            avail = [p for p in pop if added_of[p] <= day]
            prods = set()
            while len(prods) < k:
                prods.add(R.choices(avail, weights=[pop[p] for p in avail])[0])
            total = Decimal(0)
            for p in sorted(prods):
                qty = 1 if price_of[p] > 15000 else R.choices([1, 2, 3], [7, 2, 1])[0]
                infl = Decimal(str(round(1 + months * 0.006, 4)))
                pr = money(price_of[p] * infl / Decimal("1.1") if months < 16 else price_of[p])
                pr = money(pr // 10 * 10 - (Decimal("0.00") if pr < 1000 else Decimal("0.00")))
                disc = Decimal("0.00")
                if season >= 3:
                    disc = money(R.choice([0.1, 0.15, 0.2]))
                elif R.random() < 0.15:
                    disc = money(R.choice([0.05, 0.1]))
                items.append([oid, p, qty, pr, disc])
                total += money(pr * qty * (1 - disc))
            total += dcost
            orders.append([oid, cid, emp, ts.strftime("%Y-%m-%d %H:%M:%S+03"), status, dtype, dcity, dcost])
            if status in ("paid", "shipped", "delivered", "returned"):
                method = R.choices(["card", "sbp", "cash", "installment"], [50, 25 + months, 8 if dtype != "post" else 0, 10 if total > 40000 else 1])[0]
                pts = ts + dt.timedelta(minutes=R.randint(1, 90))
                pays.append([orders[-1][0], pts.strftime("%Y-%m-%d %H:%M:%S+03"), total, method])
                if status == "returned":
                    rts = ts + dt.timedelta(days=R.randint(5, 14))
                    pays.append([oid, rts.strftime("%Y-%m-%d %H:%M:%S+03"), -total, method if method != "installment" else "card"])
        day += dt.timedelta(days=1)

    # уровень лояльности по сумме доставленных заказов
    spent = {}
    order_total = {}
    for it in items:
        order_total[it[0]] = order_total.get(it[0], Decimal(0)) + it[3] * it[2] * (1 - it[4])
    for o in orders:
        if o[4] == "delivered":
            spent[o[1]] = spent.get(o[1], Decimal(0)) + order_total[o[0]]
    for c in crows:
        s = spent.get(c[0], 0)
        c[9] = "gold" if s >= 1500000 else "silver" if s >= 400000 else "bronze"

    sql.append(inserts("customers", ["id", "first_name", "last_name", "gender", "email", "phone", "city", "birth_date", "registered_at", "loyalty_level"], crows))
    sql.append(inserts("orders", ["id", "customer_id", "employee_id", "created_at", "status", "delivery_type", "delivery_city", "delivery_cost"], orders))
    sql.append(inserts("order_items", ["order_id", "product_id", "quantity", "price", "discount"], items))
    sql.append(inserts("payments", ["order_id", "paid_at", "amount", "method"], pays))

    # ---------- отзывы ----------
    texts = {
        5: ["Отличная вещь, рекомендую", "Всё супер, доставили быстро", "Лучшая покупка за год", "Полностью доволен", "Качество на высоте"],
        4: ["Хорошо, но есть мелкие недочёты", "В целом доволен", "Нормально за свои деньги", "Хороший товар, коробка помята"],
        3: ["Средне", "Ожидал большего", "Есть и плюсы, и минусы"],
        2: ["Не понравилось", "Быстро сломалось", "Качество так себе"],
        1: ["Ужасно, вернул", "Пришёл брак", "Не рекомендую"],
    }
    bias = {p[0]: R.uniform(-1.2, 0.6) for p in prows}
    revs, seen = [], set()
    delivered = {o[0]: o for o in orders if o[4] in ("delivered", "returned")}
    for it in items:
        o = delivered.get(it[0])
        if not o or R.random() > 0.33:
            continue
        key = (it[1], o[1])
        if key in seen:
            continue
        seen.add(key)
        r = 1 if o[4] == "returned" and R.random() < 0.7 else max(1, min(5, round(R.gauss(4.3 + bias[it[1]], 0.9))))
        body = None if R.random() < 0.25 else R.choice(texts[r])
        created = dt.datetime.strptime(o[3][:19], "%Y-%m-%d %H:%M:%S") + dt.timedelta(days=R.randint(3, 30))
        if created.date() > END:
            continue
        revs.append([it[1], o[1], r, body, created.strftime("%Y-%m-%d %H:%M:%S+03")])
    revs.sort(key=lambda r: r[4])
    sql.append(inserts("reviews", ["product_id", "customer_id", "rating", "body", "created_at"], revs))

    sql.append("""
-- счётчики serial продолжают нумерацию после загруженных данных
SELECT setval('products_id_seq', (SELECT max(id) FROM products));
SELECT setval('customers_id_seq', (SELECT max(id) FROM customers));
SELECT setval('employees_id_seq', (SELECT max(id) FROM employees));
SELECT setval('orders_id_seq', (SELECT max(id) FROM orders));

-- индексы для частых запросов
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);

-- готовые представления
CREATE VIEW v_order_totals AS
SELECT o.id AS order_id,
       o.customer_id,
       o.created_at,
       o.status,
       sum(oi.quantity * oi.price * (1 - oi.discount))::numeric(12,2) AS items_total,
       o.delivery_cost,
       (sum(oi.quantity * oi.price * (1 - oi.discount)) + o.delivery_cost)::numeric(12,2) AS total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id;
COMMENT ON VIEW v_order_totals IS 'Сумма каждого заказа: товары со скидкой + доставка';

CREATE VIEW v_monthly_sales AS
SELECT date_trunc('month', created_at)::date AS month,
       count(*) AS orders,
       sum(total) AS revenue,
       round(avg(total), 2) AS avg_check
FROM v_order_totals
WHERE status = 'delivered'
GROUP BY 1
ORDER BY 1;
COMMENT ON VIEW v_monthly_sales IS 'Выручка по доставленным заказам помесячно';

CREATE VIEW v_product_stats AS
SELECT p.id, p.name, p.brand, c.name AS category,
       coalesce(s.units, 0) AS units_sold,
       r.avg_rating,
       coalesce(r.cnt, 0) AS reviews
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN (SELECT product_id, sum(quantity) AS units FROM order_items GROUP BY product_id) s ON s.product_id = p.id
LEFT JOIN (SELECT product_id, round(avg(rating), 2) AS avg_rating, count(*) AS cnt FROM reviews GROUP BY product_id) r ON r.product_id = p.id;
COMMENT ON VIEW v_product_stats IS 'Продажи и рейтинг по каждому товару';

COMMIT;

-- собрать статистику, чтобы приложение показывало число строк
ANALYZE;

-- Готово. Попробуй: SELECT * FROM v_monthly_sales;
""")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(sql), "utf-8")
    print(f"{OUT}: {OUT.stat().st_size // 1024} KB, products {len(prows)}, customers {len(crows)}, "
          f"orders {len(orders)}, items {len(items)}, payments {len(pays)}, reviews {len(revs)}")


if __name__ == "__main__":
    main()
