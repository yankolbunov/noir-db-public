-- Демо-база «Университет» для Noir DB.
-- Импорт: «•••» рядом с выбором базы → «Новая база» → university, затем там же «Импорт SQL» → этот файл.
-- Данные выдуманные и каждый раз одинаковые (random с фиксированным setseed).
--
-- Что внутри:
--   faculties         факультеты
--   departments       кафедры (у каждой – заведующий из teachers)
--   teachers          преподаватели: должность, степень, зарплата
--   student_groups    учебные группы (БИ-231 и т. п.), у группы есть куратор
--   students          студенты: группа, статус, бюджет или контракт, стипендия
--   courses           дисциплины кафедр: семестр, часы, экзамен или зачёт
--   course_offerings  кто какую дисциплину ведёт в какой группе и в каком учебном году
--   grades            оценки за экзамены и зачёты, с пересдачами
--   attendance        посещаемость занятий текущего семестра
--   tuition_payments  оплата обучения студентами-контрактниками
--   v_student_gpa, v_group_performance, v_teacher_load – готовые представления для отчётов

drop view if exists v_student_gpa, v_group_performance, v_teacher_load cascade;
drop table if exists tuition_payments, attendance, grades, course_offerings, courses, students, student_groups,
  departments, teachers, faculties cascade;

select setseed(0.2026);

-- ---------- справочники ----------
create table faculties (
  id serial primary key,
  name text not null unique,
  short_name text not null unique,
  building text not null,
  founded_year integer not null
);
comment on table faculties is 'Факультеты университета';

insert into faculties (name, short_name, building, founded_year) values
  ('Экономический факультет', 'ЭФ', 'Корпус А', 1965),
  ('Факультет бизнес-информатики', 'БИ', 'Корпус Б', 2004),
  ('Факультет компьютерных наук', 'КН', 'Корпус Б', 1998),
  ('Юридический факультет', 'ЮФ', 'Корпус В', 1971),
  ('Факультет журналистики', 'ЖФ', 'Корпус Г', 1990),
  ('Факультет иностранных языков', 'ИЯ', 'Корпус Г', 1958);

create table teachers (
  id serial primary key,
  department_id integer,
  full_name text not null,
  gender char(1) not null check (gender in ('m', 'f')),
  position text not null check (position in ('ассистент', 'старший преподаватель', 'доцент', 'профессор')),
  academic_degree text not null default 'нет' check (academic_degree in ('нет', 'кандидат наук', 'доктор наук')),
  email text not null unique,
  hired_at date not null,
  salary numeric(10,2) not null
);
comment on table teachers is 'Преподаватели';

create table departments (
  id serial primary key,
  faculty_id integer not null references faculties(id),
  name text not null unique,
  phone text,
  head_id integer references teachers(id)
);
comment on table departments is 'Кафедры';
comment on column departments.head_id is 'Заведующий кафедрой';

alter table teachers add foreign key (department_id) references departments(id);

insert into departments (faculty_id, name, phone)
select f.id, d.name, '+7 861 2' || lpad((100000 + (random() * 899999)::int)::text, 6, '0')
from (values
  ('ЭФ', 'Кафедра экономической теории'), ('ЭФ', 'Кафедра финансов и кредита'), ('ЭФ', 'Кафедра бухгалтерского учёта'), ('ЭФ', 'Кафедра мировой экономики'),
  ('БИ', 'Кафедра бизнес-аналитики'), ('БИ', 'Кафедра информационных систем'), ('БИ', 'Кафедра цифрового маркетинга'), ('БИ', 'Кафедра управления проектами'),
  ('КН', 'Кафедра программирования'), ('КН', 'Кафедра анализа данных'), ('КН', 'Кафедра математики'), ('КН', 'Кафедра компьютерных сетей'),
  ('ЮФ', 'Кафедра гражданского права'), ('ЮФ', 'Кафедра уголовного права'), ('ЮФ', 'Кафедра теории государства и права'), ('ЮФ', 'Кафедра международного права'),
  ('ЖФ', 'Кафедра печатных СМИ'), ('ЖФ', 'Кафедра телевидения и радио'), ('ЖФ', 'Кафедра медиакоммуникаций'), ('ЖФ', 'Кафедра литературы'),
  ('ИЯ', 'Кафедра английского языка'), ('ИЯ', 'Кафедра немецкого языка'), ('ИЯ', 'Кафедра перевода'), ('ИЯ', 'Кафедра лингвистики')
) d(fac, name)
join faculties f on f.short_name = d.fac;

-- имена для людей
create temp table _m_names as select unnest(array['Александр','Дмитрий','Максим','Сергей','Андрей','Алексей','Артём','Илья','Кирилл','Михаил',
  'Никита','Матвей','Роман','Егор','Арсений','Иван','Денис','Евгений','Тимофей','Владислав','Павел','Глеб','Даниил','Ярослав']) n;
create temp table _f_names as select unnest(array['Анастасия','Мария','Анна','Виктория','Екатерина','Наталья','Марина','Полина','Дарья','Алина',
  'Ксения','Елизавета','Софья','Валерия','Ольга','Юлия','Вероника','Арина','Татьяна','Ирина','Кристина','Алёна','Ева','Василиса']) n;
create temp table _m_patr as select unnest(array['Александрович','Дмитриевич','Сергеевич','Андреевич','Алексеевич','Михайлович','Иванович',
  'Николаевич','Владимирович','Петрович','Викторович','Юрьевич']) n;
create temp table _last as select unnest(array['Иванов','Петров','Смирнов','Кузнецов','Попов','Васильев','Соколов','Михайлов','Новиков','Фёдоров',
  'Морозов','Волков','Алексеев','Лебедев','Семёнов','Егоров','Павлов','Козлов','Степанов','Николаев','Орлов','Андреев','Макаров','Никитин',
  'Захаров','Зайцев','Соловьёв','Борисов','Яковлев','Григорьев','Романов','Воробьёв','Сергеев','Кузьмин','Фролов','Александров','Дмитриев',
  'Королёв','Гусев','Киселёв','Ильин','Максимов','Поляков','Сорокин','Виноградов','Ковалёв','Белов','Медведев','Антонов','Тарасов']) n;
create temp table _cities as select unnest(array['Краснодар','Краснодар','Краснодар','Краснодар','Новороссийск','Сочи','Армавир','Анапа','Геленджик',
  'Ростов-на-Дону','Ставрополь','Майкоп','Ейск','Туапсе','Кропоткин','Москва']) n;

-- ---------- преподаватели ----------
insert into teachers (department_id, full_name, gender, position, academic_degree, email, hired_at, salary)
select d.id, x.full_name, x.gender, x.position,
       case when x.position = 'профессор' then 'доктор наук'
            when x.position = 'доцент' then 'кандидат наук'
            when random() < 0.25 then 'кандидат наук' else 'нет' end,
       'teacher' || (row_number() over ()) || '@noir-univ.ru',
       date '1995-09-01' + (random() * 10500)::int,
       0
from departments d
cross join lateral (
  select g, case when random() < 0.55 then 'f' else 'm' end as gender,
         case when g = 1 then 'профессор' when g <= 3 then 'доцент' when g <= 5 then 'старший преподаватель' else 'ассистент' end as position,
         ''::text as full_name
  from generate_series(1, 4 + (random() * 3)::int) g
) x;

update teachers t set full_name = case when t.gender = 'm'
    then (select n from _last order by random() + t.id * 0 limit 1) || ' ' || (select n from _m_names order by random() + t.id * 0 limit 1)
         || ' ' || (select n from _m_patr order by random() + t.id * 0 limit 1)
    else (select n || 'а' from _last order by random() + t.id * 0 limit 1) || ' ' || (select n from _f_names order by random() + t.id * 0 limit 1)
         || ' ' || (select replace(replace(n, 'ович', 'овна'), 'евич', 'евна') from _m_patr order by random() + t.id * 0 limit 1)
  end,
  salary = round((case position when 'профессор' then 120000 when 'доцент' then 85000 when 'старший преподаватель' then 62000 else 45000 end
                  * (0.9 + random() * 0.3))::numeric, -2);

-- у каждого преподавателя своё ФИО: совпавшим подбираем другое имя (несколько проходов на случай нового совпадения)
update teachers t set full_name = split_part(t.full_name, ' ', 1) || ' ' ||
    case when t.gender = 'm' then (select n from _m_names order by random() + t.id * 0 limit 1)
         else (select n from _f_names order by random() + t.id * 0 limit 1) end || ' ' || split_part(t.full_name, ' ', 3)
where t.id not in (select min(id) from teachers group by full_name);
update teachers t set full_name = split_part(t.full_name, ' ', 1) || ' ' ||
    case when t.gender = 'm' then (select n from _m_names order by random() + t.id * 0 limit 1)
         else (select n from _f_names order by random() + t.id * 0 limit 1) end || ' ' || split_part(t.full_name, ' ', 3)
where t.id not in (select min(id) from teachers group by full_name);
alter table teachers add constraint teachers_full_name_key unique (full_name);

update departments d set head_id = (select t.id from teachers t where t.department_id = d.id order by t.position = 'профессор' desc, t.hired_at limit 1);

-- ---------- группы и студенты ----------
create table student_groups (
  id serial primary key,
  faculty_id integer not null references faculties(id),
  code text not null unique,
  year_started integer not null,
  curator_id integer references teachers(id)
);
comment on table student_groups is 'Учебные группы';
comment on column student_groups.code is 'Шифр группы: факультет, год поступления, номер';

insert into student_groups (faculty_id, code, year_started, curator_id)
select f.id, f.short_name || '-' || (y % 100) || n, y,
       (select t.id from teachers t join departments d on d.id = t.department_id
         where d.faculty_id = f.id order by random() + f.id * 0 + y * 0 + n * 0 limit 1)
from faculties f
cross join generate_series(2022, 2026) y
cross join generate_series(1, case when f.short_name in ('БИ', 'КН', 'ЭФ') then 2 else 1 end) n
order by f.id, y, n;

create table students (
  id serial primary key,
  group_id integer not null references student_groups(id),
  last_name text not null,
  first_name text not null,
  gender char(1) not null check (gender in ('m', 'f')),
  birth_date date not null,
  email text not null unique,
  phone text,
  city text not null,
  enrolled_at date not null,
  status text not null default 'учится' check (status in ('учится', 'академ', 'отчислен', 'выпускник')),
  funding text not null check (funding in ('бюджет', 'контракт')),
  scholarship numeric(10,2) not null default 0
);
comment on table students is 'Студенты';
comment on column students.funding is 'Форма обучения: бюджет или контракт';

insert into students (group_id, last_name, first_name, gender, birth_date, email, phone, city, enrolled_at, status, funding)
select g.id, '', '', case when random() < 0.52 then 'f' else 'm' end,
       make_date(g.year_started - 18, 1, 1) + (random() * 540)::int - 120,
       md5(random()::text), case when random() < 0.93 then '+7 9' || lpad((random() * 999999999)::bigint::text, 9, '0') end,
       '', make_date(g.year_started, 8, 25) + (random() * 6)::int,
       case when g.year_started = 2022 then 'выпускник' else 'учится' end,
       case when random() < 0.62 then 'бюджет' else 'контракт' end
from student_groups g
cross join generate_series(1, 20 + (random() * 9)::int) s;

update students s set
  last_name = (select n || case when s.gender = 'f' then 'а' else '' end from _last order by random() + s.id * 0 limit 1),
  first_name = case when s.gender = 'f' then (select n from _f_names order by random() + s.id * 0 limit 1)
                    else (select n from _m_names order by random() + s.id * 0 limit 1) end,
  city = (select n from _cities order by random() + s.id * 0 limit 1),
  email = 'st' || lpad(s.id::text, 5, '0') || '@student.noir-univ.ru';

-- часть студентов ушла в академ или отчислена (у выпускников статус не меняем)
update students set status = case when random() < 0.45 then 'академ' else 'отчислен' end
where status = 'учится' and random() < 0.07;

-- ---------- дисциплины ----------
create table courses (
  id serial primary key,
  department_id integer not null references departments(id),
  name text not null,
  semester smallint not null check (semester between 1 and 8),
  hours smallint not null,
  credits smallint not null,
  control text not null check (control in ('экзамен', 'зачёт')),
  unique (department_id, name)
);
comment on table courses is 'Дисциплины учебного плана';
comment on column courses.control is 'Форма контроля: экзамен (оценка 2–5) или зачёт (сдал / не сдал)';

insert into courses (department_id, name, semester, hours, credits, control)
select d.id, c.name, c.sem, c.hours, greatest(2, c.hours / 36), c.control
from departments d
join (values
  ('Кафедра экономической теории', 'Микроэкономика', 1, 144, 'экзамен'), ('Кафедра экономической теории', 'Макроэкономика', 2, 144, 'экзамен'),
  ('Кафедра экономической теории', 'История экономических учений', 3, 72, 'зачёт'), ('Кафедра экономической теории', 'Институциональная экономика', 5, 108, 'экзамен'),
  ('Кафедра финансов и кредита', 'Финансы', 3, 144, 'экзамен'), ('Кафедра финансов и кредита', 'Деньги, кредит, банки', 4, 108, 'экзамен'),
  ('Кафедра финансов и кредита', 'Корпоративные финансы', 6, 144, 'экзамен'), ('Кафедра бухгалтерского учёта', 'Бухгалтерский учёт', 3, 144, 'экзамен'),
  ('Кафедра бухгалтерского учёта', 'Аудит', 7, 108, 'экзамен'), ('Кафедра бухгалтерского учёта', 'Налоги и налогообложение', 5, 108, 'зачёт'),
  ('Кафедра мировой экономики', 'Мировая экономика', 4, 108, 'экзамен'), ('Кафедра мировой экономики', 'Международные финансы', 6, 108, 'зачёт'),
  ('Кафедра бизнес-аналитики', 'Введение в бизнес-аналитику', 1, 108, 'зачёт'), ('Кафедра бизнес-аналитики', 'Статистика', 2, 144, 'экзамен'),
  ('Кафедра бизнес-аналитики', 'Анализ данных в Excel', 2, 72, 'зачёт'), ('Кафедра бизнес-аналитики', 'Эконометрика', 4, 144, 'экзамен'),
  ('Кафедра бизнес-аналитики', 'BI-системы и визуализация', 5, 108, 'экзамен'), ('Кафедра бизнес-аналитики', 'Прогнозирование', 7, 108, 'экзамен'),
  ('Кафедра информационных систем', 'Базы данных', 3, 144, 'экзамен'), ('Кафедра информационных систем', 'SQL для аналитиков', 4, 108, 'экзамен'),
  ('Кафедра информационных систем', 'Проектирование информационных систем', 6, 144, 'экзамен'), ('Кафедра информационных систем', 'ERP-системы', 7, 72, 'зачёт'),
  ('Кафедра цифрового маркетинга', 'Маркетинг', 3, 108, 'экзамен'), ('Кафедра цифрового маркетинга', 'Веб-аналитика', 5, 108, 'зачёт'),
  ('Кафедра управления проектами', 'Менеджмент', 1, 108, 'экзамен'), ('Кафедра управления проектами', 'Управление ИТ-проектами', 6, 108, 'экзамен'),
  ('Кафедра программирования', 'Программирование на Python', 1, 180, 'экзамен'), ('Кафедра программирования', 'Алгоритмы и структуры данных', 2, 180, 'экзамен'),
  ('Кафедра программирования', 'Объектно-ориентированное программирование', 3, 144, 'экзамен'), ('Кафедра программирования', 'Веб-разработка', 5, 144, 'зачёт'),
  ('Кафедра анализа данных', 'Машинное обучение', 5, 180, 'экзамен'), ('Кафедра анализа данных', 'Теория вероятностей', 3, 144, 'экзамен'),
  ('Кафедра анализа данных', 'Глубокое обучение', 7, 144, 'экзамен'), ('Кафедра математики', 'Математический анализ', 1, 180, 'экзамен'),
  ('Кафедра математики', 'Линейная алгебра', 2, 144, 'экзамен'), ('Кафедра математики', 'Дискретная математика', 2, 108, 'зачёт'),
  ('Кафедра компьютерных сетей', 'Компьютерные сети', 4, 144, 'экзамен'), ('Кафедра компьютерных сетей', 'Информационная безопасность', 6, 108, 'зачёт'),
  ('Кафедра гражданского права', 'Гражданское право', 3, 180, 'экзамен'), ('Кафедра гражданского права', 'Семейное право', 5, 72, 'зачёт'),
  ('Кафедра уголовного права', 'Уголовное право', 4, 180, 'экзамен'), ('Кафедра уголовного права', 'Криминология', 6, 108, 'экзамен'),
  ('Кафедра теории государства и права', 'Теория государства и права', 1, 144, 'экзамен'), ('Кафедра теории государства и права', 'Конституционное право', 2, 144, 'экзамен'),
  ('Кафедра международного права', 'Международное публичное право', 5, 108, 'экзамен'), ('Кафедра международного права', 'Право ЕАЭС', 7, 72, 'зачёт'),
  ('Кафедра печатных СМИ', 'Основы журналистики', 1, 144, 'экзамен'), ('Кафедра печатных СМИ', 'Редактирование', 4, 108, 'экзамен'),
  ('Кафедра телевидения и радио', 'Тележурналистика', 3, 144, 'экзамен'), ('Кафедра телевидения и радио', 'Радиожурналистика', 5, 108, 'зачёт'),
  ('Кафедра медиакоммуникаций', 'Медиааналитика', 6, 108, 'экзамен'), ('Кафедра медиакоммуникаций', 'Социальные сети и SMM', 2, 72, 'зачёт'),
  ('Кафедра литературы', 'История русской литературы', 1, 144, 'экзамен'), ('Кафедра литературы', 'Зарубежная литература', 3, 108, 'экзамен'),
  ('Кафедра английского языка', 'Практический курс английского языка', 1, 216, 'экзамен'), ('Кафедра английского языка', 'Деловой английский', 4, 144, 'экзамен'),
  ('Кафедра немецкого языка', 'Немецкий язык', 2, 144, 'экзамен'), ('Кафедра немецкого языка', 'Страноведение Германии', 5, 72, 'зачёт'),
  ('Кафедра перевода', 'Теория перевода', 3, 144, 'экзамен'), ('Кафедра перевода', 'Синхронный перевод', 7, 144, 'экзамен'),
  ('Кафедра лингвистики', 'Введение в языкознание', 1, 108, 'экзамен'), ('Кафедра лингвистики', 'Корпусная лингвистика', 6, 108, 'зачёт'),
  -- общие дисциплины читают кафедры своих факультетов
  ('Кафедра экономической теории', 'Философия', 2, 72, 'зачёт'), ('Кафедра информационных систем', 'Информатика', 1, 108, 'зачёт'),
  ('Кафедра программирования', 'Операционные системы', 4, 108, 'зачёт'), ('Кафедра математики', 'Высшая математика', 1, 144, 'экзамен'),
  ('Кафедра теории государства и права', 'История России', 1, 72, 'зачёт'), ('Кафедра медиакоммуникаций', 'Риторика', 2, 72, 'зачёт'),
  ('Кафедра английского языка', 'Английский язык в профессии', 3, 108, 'зачёт'), ('Кафедра перевода', 'Английский язык', 2, 108, 'экзамен')
) c(dep, name, sem, hours, control) on c.dep = d.name;

-- ---------- кто что ведёт ----------
create table course_offerings (
  id serial primary key,
  course_id integer not null references courses(id),
  group_id integer not null references student_groups(id),
  teacher_id integer not null references teachers(id),
  academic_year text not null,
  semester smallint not null check (semester between 1 and 8),
  unique (course_id, group_id)
);
comment on table course_offerings is 'Дисциплина в конкретной группе: кто ведёт и когда';

-- группа проходит все дисциплины своего факультета; семестр 1 начинается в год поступления
insert into course_offerings (course_id, group_id, teacher_id, academic_year, semester)
select c.id, g.id,
       (select t.id from teachers t where t.department_id = c.department_id order by random() + c.id * 0 + g.id * 0 limit 1),
       (g.year_started + (c.semester - 1) / 2) || '/' || (g.year_started + (c.semester - 1) / 2 + 1), c.semester
from student_groups g
join departments d on d.faculty_id = g.faculty_id
join courses c on c.department_id = d.id
-- сейчас осень 2026: идёт нечётный семестр, будущие семестры ещё не назначены
where c.semester <= (2026 - g.year_started) * 2 + 1;

-- ---------- оценки ----------
create table grades (
  id serial primary key,
  student_id integer not null references students(id),
  offering_id integer not null references course_offerings(id),
  attempt smallint not null default 1 check (attempt between 1 and 3),
  grade smallint check (grade between 2 and 5),
  passed boolean not null,
  exam_date date not null,
  unique (student_id, offering_id, attempt)
);
comment on table grades is 'Результаты экзаменов и зачётов (несданные – с пересдачами)';
comment on column grades.grade is 'Оценка 2–5 для экзамена; у зачёта пусто';

-- «способность» студента – чтобы у одних оценки были стабильно выше, чем у других
create temp table _ability as select id, random() as a from students;

insert into grades (student_id, offering_id, attempt, grade, passed, exam_date)
select s.id, o.id, 1, x.grade, coalesce(x.grade >= 3, x.ok),
       -- осенний семестр сдают в январе, весенний – в июне
       make_date(split_part(o.academic_year, '/', 2)::int, case when o.semester % 2 = 1 then 1 else 6 end, 10) + (random() * 18)::int
from course_offerings o
join courses c on c.id = o.course_id
join student_groups g on g.id = o.group_id
join students s on s.group_id = g.id
join _ability ab on ab.id = s.id
cross join lateral (
  select case when c.control = 'экзамен'
              then greatest(2, least(5, round(2.3 + ab.a * 2.6 + (random() - 0.5) * 1.4)))::smallint end as grade,
         random() < 0.72 + ab.a * 0.27 as ok
) x
-- текущий семестр ещё не закрыт – оценок нет
where c.semester <= (2026 - g.year_started) * 2
  and (s.status <> 'отчислен' or random() < 0.6);

-- пересдачи: большинство несданного пересдают с первой или второй попытки
insert into grades (student_id, offering_id, attempt, grade, passed, exam_date)
select g.student_id, g.offering_id, 2,
       case when g.grade is not null then (case when r.ok then 3 + (random() < 0.15)::int else 2 end)::smallint end,
       r.ok, g.exam_date + 14 + (random() * 10)::int
from grades g
cross join lateral (select random() < 0.8 + g.id * 0 as ok) r
where not g.passed and random() < 0.85;

-- ---------- посещаемость текущего семестра ----------
create table attendance (
  id serial primary key,
  student_id integer not null references students(id),
  offering_id integer not null references course_offerings(id),
  lesson_date date not null,
  present boolean not null,
  unique (student_id, offering_id, lesson_date)
);
comment on table attendance is 'Посещаемость занятий (осень 2026)';

insert into attendance (student_id, offering_id, lesson_date, present)
select s.id, o.id, date '2026-09-01' + (o.id % 5) + w * 7, random() < 0.55 + ab.a * 0.42
from course_offerings o
join students s on s.group_id = o.group_id and s.status = 'учится'
join _ability ab on ab.id = s.id
cross join generate_series(0, 5) w
where o.academic_year = '2026/2027';

-- ---------- стипендия ----------
-- академическая – бюджетникам без долгов и троек в последнюю сессию
update students s set scholarship = case when x.min_grade = 5 then 6200 when x.min_grade = 4 then 3700 else 0 end
from (
  select gr.student_id, min(coalesce(gr.grade, 5)) filter (where gr.passed) as min_grade, bool_and(gr.passed) as clean
  from grades gr
  join course_offerings o on o.id = gr.offering_id
  join student_groups g on g.id = o.group_id
  where o.semester = (2026 - g.year_started) * 2 and gr.attempt = (select max(attempt) from grades g2 where g2.student_id = gr.student_id and g2.offering_id = gr.offering_id)
  group by gr.student_id
) x
where x.student_id = s.id and s.funding = 'бюджет' and s.status = 'учится' and x.clean;

-- ---------- оплата контракта ----------
create table tuition_payments (
  id serial primary key,
  student_id integer not null references students(id),
  period text not null,
  amount numeric(10,2) not null check (amount > 0),
  paid_at date not null,
  method text not null check (method in ('карта', 'банковский перевод', 'материнский капитал', 'кредит'))
);
comment on table tuition_payments is 'Оплата обучения студентами-контрактниками (по семестрам)';

insert into tuition_payments (student_id, period, amount, paid_at, method)
select s.id, y || '/' || (y + 1) || case when half = 1 then ', осень' else ', весна' end,
       (case f.short_name when 'ЮФ' then 74000 when 'КН' then 82000 when 'БИ' then 78000 when 'ЭФ' then 71000 else 62000 end
        * power(1.06, y - 2022))::numeric(10,2),
       make_date(y + case when half = 1 then 0 else 1 end, case when half = 1 then 8 else 1 end, 20) + (random() * 45)::int,
       case when random() < 0.62 then 'карта' when random() < 0.75 then 'банковский перевод' when random() < 0.6 then 'кредит' else 'материнский капитал' end
from students s
join student_groups g on g.id = s.group_id
join faculties f on f.id = g.faculty_id
cross join generate_series(g.year_started, least(2026, g.year_started + 3)) y
cross join generate_series(1, 2) half
where s.funding = 'контракт'
  and make_date(y + case when half = 1 then 0 else 1 end, case when half = 1 then 8 else 1 end, 20) <= date '2026-10-01'
  and (s.status <> 'отчислен' or y < 2025)
  and random() < 0.96;           -- кто-то ещё не заплатил

-- ---------- индексы для частых запросов ----------
create index on students (group_id);
create index on teachers (department_id);
create index on course_offerings (group_id);
create index on course_offerings (teacher_id);
create index on grades (offering_id);
create index on attendance (offering_id);
create index on tuition_payments (student_id);

-- ---------- представления для отчётов ----------
create view v_student_gpa as
select s.id as student_id, s.last_name || ' ' || s.first_name as student, g.code as group_code, s.status, s.funding,
       round(avg(gr.grade) filter (where gr.passed and gr.grade is not null), 2) as gpa,
       count(*) filter (where gr.passed) as passed_count,
       count(distinct gr.offering_id) filter (where not exists (
         select 1 from grades g2 where g2.student_id = gr.student_id and g2.offering_id = gr.offering_id and g2.passed)) as debts
from students s
join student_groups g on g.id = s.group_id
left join grades gr on gr.student_id = s.id
group by s.id, g.code;
comment on view v_student_gpa is 'Средний балл и долги каждого студента';

create view v_group_performance as
select g.code as group_code, f.short_name as faculty, g.year_started,
       count(distinct s.id) as students,
       round(avg(gr.grade) filter (where gr.grade is not null and gr.passed), 2) as avg_grade,
       round(100.0 * count(*) filter (where gr.grade = 5) / nullif(count(*) filter (where gr.grade is not null), 0), 1) as excellent_pct,
       round(100.0 * count(*) filter (where not gr.passed) / nullif(count(gr.id), 0), 1) as fail_pct
from student_groups g
join faculties f on f.id = g.faculty_id
left join students s on s.group_id = g.id
left join grades gr on gr.student_id = s.id and gr.attempt = 1
group by g.id, f.short_name
order by g.code;
comment on view v_group_performance is 'Успеваемость групп: средний балл, доля пятёрок и несдач с первой попытки';

create view v_teacher_load as
select t.id as teacher_id, t.full_name, t.position, d.name as department, o.academic_year,
       count(*) as courses, sum(c.hours) as hours, count(distinct o.group_id) as groups
from teachers t
join departments d on d.id = t.department_id
join course_offerings o on o.teacher_id = t.id
join courses c on c.id = o.course_id
group by t.id, d.name, o.academic_year;
comment on view v_teacher_load is 'Учебная нагрузка преподавателей по учебным годам';

drop table _m_names, _f_names, _m_patr, _last, _cities, _ability;
analyze;
