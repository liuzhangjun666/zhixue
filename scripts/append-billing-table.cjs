const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'server', 'src', 'schema.sql')
let content = fs.readFileSync(schemaPath, 'utf8')

const append = `
-- 支付流水表
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_no VARCHAR(64) NOT NULL UNIQUE,
  type ENUM('membership','unlock','refund','other') NOT NULL DEFAULT 'membership',
  title VARCHAR(100) NOT NULL DEFAULT '',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  pay_method VARCHAR(30) DEFAULT '',
  remark VARCHAR(255) DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pt_user_time(user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 支付流水种子数据
INSERT INTO payment_transactions (id, user_id, order_no, type, title, amount, status, pay_method, remark, created_at) VALUES
(1, 1, 'ZX20260215001', 'membership', '季度会员 \u2014 订阅开通', 269.00, 'paid', '微信支付', '首次开通季度会员', '2026-02-15 09:30:00'),
(2, 1, 'ZX20260220001', 'unlock', '解锁陈老师联系方式', 0.00, 'paid', '会员权益', '会员免费解锁', '2026-02-20 14:15:00'),
(3, 1, 'ZX20260305001', 'unlock', '解锁周老师联系方式', 0.00, 'paid', '会员权益', '会员免费解锁', '2026-03-05 10:00:00'),
(4, 1, 'ZX20260310001', 'refund', '取消请求退款', -50.00, 'refunded', '原路退回', '取消四年级数学专项提升退回预付款', '2026-03-10 16:20:00'),
(5, 1, 'ZX20260415001', 'membership', '季度会员 \u2014 续费', 269.00, 'paid', '支付宝', '续费季度会员', '2026-04-15 08:45:00')
ON DUPLICATE KEY UPDATE title=VALUES(title);
`

fs.writeFileSync(schemaPath, content + append, 'utf8')
console.log('schema.sql updated successfully')
