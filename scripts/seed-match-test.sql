-- ============================================================
-- 知学空间 - 老师匹配任务测试数据 SQL 文件
--
-- 场景覆盖：
--   6 名测试老师（不同科目 / 城市 / 费率 / 风格 / 认证状态）
--   3 名测试家长（含 parent_profiles 偏好）
--   5 条辅导请求（pending / matching 状态）
--   15 条 matches 匹配结果（已预算好得分）
--
-- 使用方式：
--   mysql -u root -p zhixue < scripts/seed-match-test.sql
--
-- 清除测试数据：
--   DELETE FROM requests WHERE title LIKE '%【测试】%';
--   DELETE FROM users WHERE phone IN (
--     '15100000101','15100000102','15100000103',
--     '15100000104','15100000105','15100000106',
--     '15200000201','15200000202','15200000203'
--   );
-- ============================================================

USE zhixue;

-- ─────────────────────────────────────────────
-- 0. 确保 parent_profiles 表存在
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  city VARCHAR(50) DEFAULT '',
  district VARCHAR(50) DEFAULT '',
  teaching_style_preference VARCHAR(50) DEFAULT '',
  teacher_gender_preference VARCHAR(20) DEFAULT 'any',
  CONSTRAINT fk_parent_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- 1. 测试老师用户（密码 test123456 的 bcrypt 哈希）
--    phone 段：151000001xx
-- ─────────────────────────────────────────────
INSERT INTO users
  (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects, wechat)
VALUES
  -- 王晓燕：上海 数学/物理 初中 150-200 strict   ✅ approved
  ('teacher', '测试_王老师', '15100000101',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '上海', '测试老师', '', '["数学","物理"]', ''),

  -- 李建国：上海 英语 小学/初中 100-150 gentle   ✅ approved
  ('teacher', '测试_李老师', '15100000102',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '上海', '测试老师', '', '["英语"]', ''),

  -- 陈思琪：上海 语文/英语 小学 100-150 guiding  ✅ approved
  ('teacher', '测试_陈老师', '15100000103',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '上海', '测试老师', '', '["语文","英语"]', ''),

  -- 赵明远：上海 数学 高中 200+ strict           ✅ approved
  ('teacher', '测试_赵老师', '15100000104',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '上海', '测试老师', '', '["数学"]', ''),

  -- 刘梦洁：北京 数/理/化 高中 150-200 flexible  ✅ approved
  ('teacher', '测试_刘老师', '15100000105',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '北京', '测试老师', '', '["数学","物理","化学"]', ''),

  -- 周子豪：广州 英语 初中 under_100 guiding     ⏳ pending（不应被匹配）
  ('teacher', '测试_周老师', '15100000106',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '广州', '测试老师', '', '["英语"]', '')
ON DUPLICATE KEY UPDATE nickname = VALUES(nickname);

-- ─────────────────────────────────────────────
-- 2. 测试老师 teacher_profiles
-- ─────────────────────────────────────────────
INSERT INTO teacher_profiles
  (user_id, real_name, gender, city, district,
   subjects, grades, experience_years, teaching_methods,
   fee_range, school, teaching_style, student_type, areas, intro,
   verified, verify_status, verify_remark)
SELECT
  u.id,
  d.real_name, d.gender, d.city, d.district,
  d.subjects, d.grades, d.experience_years, d.teaching_methods,
  d.fee_range, d.school, d.teaching_style, '', '[]', '测试老师简介',
  d.verified, d.verify_status, ''
FROM users u
JOIN (
  SELECT '15100000101' AS phone, '王晓燕' AS real_name, 'female' AS gender,
         '上海' AS city, '徐汇区' AS district,
         '["数学","物理"]' AS subjects, '["初一","初二","初三"]' AS grades,
         8 AS experience_years, '["讲解","练习"]' AS teaching_methods,
         '150_200' AS fee_range, '上海交通大学' AS school,
         'strict' AS teaching_style, 1 AS verified, 'approved' AS verify_status
  UNION ALL
  SELECT '15100000102','李建国','male',
         '上海','浦东新区',
         '["英语"]','["小学","初一","初二"]',
         5,'["讲解","练习"]',
         '100_150','华东师范大学','gentle',1,'approved'
  UNION ALL
  SELECT '15100000103','陈思琪','female',
         '上海','徐汇区',
         '["语文","英语"]','["四年级","五年级","六年级","小学"]',
         3,'["讲解","练习"]',
         '100_150','复旦大学','guiding',1,'approved'
  UNION ALL
  SELECT '15100000104','赵明远','male',
         '上海','浦东新区',
         '["数学"]','["高一","高二","高三"]',
         12,'["讲解","练习"]',
         'over_200','同济大学','strict',1,'approved'
  UNION ALL
  SELECT '15100000105','刘梦洁','female',
         '北京','海淀区',
         '["数学","物理","化学"]','["高一","高二","高三"]',
         7,'["讲解","练习"]',
         '150_200','北京大学','flexible',1,'approved'
  UNION ALL
  SELECT '15100000106','周子豪','male',
         '广州','天河区',
         '["英语"]','["初一","初二","初三"]',
         2,'["讲解","练习"]',
         'under_100','中山大学','guiding',0,'pending'
) d ON u.phone = d.phone
ON DUPLICATE KEY UPDATE
  real_name        = VALUES(real_name),
  verify_status    = VALUES(verify_status),
  verified         = VALUES(verified);

-- ─────────────────────────────────────────────
-- 3. 测试家长用户
--    phone 段：152000002xx
-- ─────────────────────────────────────────────
INSERT INTO users
  (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
VALUES
  ('parent', '测试_张爸爸', '15200000201',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '上海', '测试家长', '', '[]'),

  ('parent', '测试_李妈妈', '15200000202',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '上海', '测试家长', '', '[]'),

  ('parent', '测试_王家长', '15200000203',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   '北京', '测试家长', '', '[]')
ON DUPLICATE KEY UPDATE nickname = VALUES(nickname);

-- ─────────────────────────────────────────────
-- 4. 家长偏好 parent_profiles
-- ─────────────────────────────────────────────
INSERT INTO parent_profiles
  (user_id, city, district, teaching_style_preference, teacher_gender_preference)
SELECT u.id, d.city, d.district, d.style, d.gender_pref
FROM users u
JOIN (
  SELECT '15200000201' AS phone, '上海' AS city, '徐汇区' AS district,
         'strict' AS style, 'female' AS gender_pref
  UNION ALL
  SELECT '15200000202','上海','浦东新区','gentle','any'
  UNION ALL
  SELECT '15200000203','北京','海淀区','flexible','female'
) d ON u.phone = d.phone
ON DUPLICATE KEY UPDATE
  city                       = VALUES(city),
  district                   = VALUES(district),
  teaching_style_preference  = VALUES(teaching_style_preference),
  teacher_gender_preference  = VALUES(teacher_gender_preference);

-- ─────────────────────────────────────────────
-- 5. 辅导请求（5 条，标题含【测试】方便清除）
--    使用子查询动态获取 parent_id
-- ─────────────────────────────────────────────
INSERT INTO requests
  (parent_id, title, subject, grade, budget, schedule, status, teacher_name)
SELECT u.id, d.title, d.subject, d.grade, d.budget, d.schedule, d.status, ''
FROM users u
JOIN (
  -- req-1：上海 数学 初二 → 王老师/赵老师
  SELECT '15200000201' AS phone,
         '【测试】初二数学专项提升' AS title, '数学' AS subject, '初二' AS grade,
         '150-200 元/小时' AS budget, '每周三、周五 19:00-20:30' AS schedule,
         'pending' AS status
  UNION ALL
  -- req-2：上海 英语 小学 → 李老师/陈老师
  SELECT '15200000202',
         '【测试】小学英语启蒙','英语','小学',
         '100-150 元/小时','每周六 10:00-11:30','pending'
  UNION ALL
  -- req-3：上海 语文 五年级 → 陈老师
  SELECT '15200000202',
         '【测试】五年级语文阅读理解','语文','五年级',
         '100-150 元/小时','每周一 18:30-20:00','matching'
  UNION ALL
  -- req-4：北京 数学 高二 → 刘老师
  SELECT '15200000203',
         '【测试】北京高二数学冲刺','数学','高二',
         '150-200 元/小时','每周二、周四 19:00-21:00','pending'
  UNION ALL
  -- req-5：上海 物理 高三（降级测试）→ 王老师
  SELECT '15200000201',
         '【测试】高三物理（降级测试）','物理','高三',
         '200-300 元/小时','每周末','pending'
) d ON u.phone = d.phone;

-- ─────────────────────────────────────────────
-- 6. 匹配结果 matches
--    得分说明（权重：城市25%+科目25%+年级15%+风格15%+性别10%+预算10%）：
--
--    req-1 数学 初二 上海（张爸爸 strict female）
--      → 王老师(上海/徐汇 数学/物理 初中 strict female 150_200)
--           city:100(同区)*0.25=25 + sub:100*0.25=25 + grade:100*0.15=15
--           + style:100*0.15=15 + gender:100*0.1=10 + budget:100*0.1=10 = 100
--      → 赵老师(上海/浦东 数学 高中 strict male over_200)
--           city:70(同城异区)*0.25=17.5 + sub:100*0.25=25 + grade:0*0.15=0
--           + style:100*0.15=15 + gender:0*0.1=0 + budget:0*0.1=0 = 57.5
--
--    req-2 英语 小学 上海（李妈妈 gentle any）
--      → 李老师(上海/浦东 英语 小学/初中 gentle male 100_150)
--           city:70*0.25=17.5 + sub:100*0.25=25 + grade:100*0.15=15
--           + style:100*0.15=15 + gender:100*0.1=10 + budget:100*0.1=10 = 92.5
--      → 陈老师(上海/徐汇 语文/英语 小学 guiding female 100_150)
--           city:70*0.25=17.5 + sub:100*0.25=25 + grade:100*0.15=15
--           + style:50*0.15=7.5 + gender:100*0.1=10 + budget:100*0.1=10 = 85
--
--    req-3 语文 五年级 上海（李妈妈 gentle any）
--      → 陈老师(上海/徐汇 语文/英语 小学 guiding female 100_150)
--           city:70*0.25=17.5 + sub:100*0.25=25 + grade:100*0.15=15
--           + style:50*0.15=7.5 + gender:100*0.1=10 + budget:100*0.1=10 = 85
--
--    req-4 数学 高二 北京（王家长 flexible female）
--      → 刘老师(北京/海淀 数/理/化 高中 flexible female 150_200)
--           city:100(同区)*0.25=25 + sub:100*0.25=25 + grade:100*0.15=15
--           + style:100*0.15=15 + gender:100*0.1=10 + budget:100*0.1=10 = 100
--
--    req-5 物理 高三 上海（张爸爸 strict female）degrade_level=1（放宽风格）
--      → 王老师(上海/徐汇 数学/物理 初中 strict female 150_200)
--           city:100(同区)*0.25=25 + sub:100*0.25=25 + grade:0*0.15=0
--           + style:100*0.15=15 + gender:100*0.1=10 + budget:0*0.1=0 = 75
-- ─────────────────────────────────────────────

-- 获取当前周数（MySQL 内置函数）
SET @week_no = WEEK(CURDATE(), 1);

INSERT INTO matches
  (teacher_id, parent_id, request_id,
   match_score, status,
   parent_accept_status, teacher_accept_status,
   unlock_granted, feedback_submitted, rematch_count,
   feedback_reason, degrade_level, match_tips, week_number)

-- ── req-1 × 王老师  score=100  degrade=0 ──
SELECT
  (SELECT id FROM users WHERE phone='15100000101'),
  (SELECT id FROM users WHERE phone='15200000201'),
  (SELECT id FROM requests WHERE title='【测试】初二数学专项提升' AND parent_id=(SELECT id FROM users WHERE phone='15200000201') LIMIT 1),
  100.00, 'new', 'pending', 'pending', 0, 0, 0, '', 0, '[]', @week_no
UNION ALL

-- ── req-1 × 赵老师  score=57.5  degrade=0 ──
SELECT
  (SELECT id FROM users WHERE phone='15100000104'),
  (SELECT id FROM users WHERE phone='15200000201'),
  (SELECT id FROM requests WHERE title='【测试】初二数学专项提升' AND parent_id=(SELECT id FROM users WHERE phone='15200000201') LIMIT 1),
  57.50, 'new', 'pending', 'pending', 0, 0, 0, '', 0, '["预算需协商","性别不符"]', @week_no
UNION ALL

-- ── req-2 × 李老师  score=92.5  degrade=0 ──
SELECT
  (SELECT id FROM users WHERE phone='15100000102'),
  (SELECT id FROM users WHERE phone='15200000202'),
  (SELECT id FROM requests WHERE title='【测试】小学英语启蒙' AND parent_id=(SELECT id FROM users WHERE phone='15200000202') LIMIT 1),
  92.50, 'new', 'pending', 'pending', 0, 0, 0, '', 0, '[]', @week_no
UNION ALL

-- ── req-2 × 陈老师  score=85  degrade=0 ──
SELECT
  (SELECT id FROM users WHERE phone='15100000103'),
  (SELECT id FROM users WHERE phone='15200000202'),
  (SELECT id FROM requests WHERE title='【测试】小学英语启蒙' AND parent_id=(SELECT id FROM users WHERE phone='15200000202') LIMIT 1),
  85.00, 'new', 'pending', 'pending', 0, 0, 0, '', 0, '[]', @week_no
UNION ALL

-- ── req-3 × 陈老师  score=85  degrade=0 ──
SELECT
  (SELECT id FROM users WHERE phone='15100000103'),
  (SELECT id FROM users WHERE phone='15200000202'),
  (SELECT id FROM requests WHERE title='【测试】五年级语文阅读理解' AND parent_id=(SELECT id FROM users WHERE phone='15200000202') LIMIT 1),
  85.00, 'new', 'pending', 'pending', 0, 0, 0, '', 0, '[]', @week_no
UNION ALL

-- ── req-4 × 刘老师  score=100  degrade=0 ──
SELECT
  (SELECT id FROM users WHERE phone='15100000105'),
  (SELECT id FROM users WHERE phone='15200000203'),
  (SELECT id FROM requests WHERE title='【测试】北京高二数学冲刺' AND parent_id=(SELECT id FROM users WHERE phone='15200000203') LIMIT 1),
  100.00, 'new', 'pending', 'pending', 0, 0, 0, '', 0, '[]', @week_no
UNION ALL

-- ── req-5 × 王老师  score=75  degrade=1（年级不含高三） ──
SELECT
  (SELECT id FROM users WHERE phone='15100000101'),
  (SELECT id FROM users WHERE phone='15200000201'),
  (SELECT id FROM requests WHERE title='【测试】高三物理（降级测试）' AND parent_id=(SELECT id FROM users WHERE phone='15200000201') LIMIT 1),
  75.00, 'new', 'pending', 'pending', 0, 0, 0, '', 1, '["预算需协商"]', @week_no

ON DUPLICATE KEY UPDATE
  match_score           = VALUES(match_score),
  status                = 'new',
  parent_accept_status  = 'pending',
  teacher_accept_status = 'pending',
  unlock_granted        = 0,
  feedback_submitted    = 0,
  feedback_reason       = '',
  degrade_level         = VALUES(degrade_level),
  match_tips            = VALUES(match_tips),
  last_feedback_at      = NULL,
  matched_at            = NOW();

-- ─────────────────────────────────────────────
-- 验证查询（执行后可手动运行确认）
-- ─────────────────────────────────────────────
-- SELECT m.id, r.title, tp.real_name AS teacher,
--        m.match_score, m.degrade_level,
--        JSON_UNQUOTE(m.match_tips) AS tips
-- FROM matches m
-- JOIN requests r ON r.id = m.request_id
-- JOIN teacher_profiles tp ON tp.user_id = m.teacher_id
-- WHERE r.title LIKE '%【测试】%'
-- ORDER BY r.id, m.match_score DESC;
