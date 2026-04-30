const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, '..', 'src', 'api', 'parent.ts')
let content = fs.readFileSync(filePath, 'utf8')

const insertBefore = 'const normalizeSettings'
const idx = content.indexOf(insertBefore)
if (idx === -1) {
  console.error('Cannot find normalizeSettings')
  process.exit(1)
}

const newFunctions = `const normalizeTransaction = (raw: Record<string, any>): BillingTransactionDTO => ({
  id: Number(raw.id || 0),
  orderNo: String(raw.orderNo || raw.order_no || ''),
  type: (raw.type || 'other') as TransactionType,
  title: String(raw.title || ''),
  amount: Number(raw.amount || 0),
  status: (raw.status || 'pending') as TransactionStatus,
  payMethod: String(raw.payMethod || raw.pay_method || ''),
  remark: String(raw.remark || ''),
  createdAt: String(raw.createdAt || raw.created_at || '')
})

const normalizeBillingStats = (raw: Record<string, any>): BillingStatsDTO => ({
  totalSpent: Number(raw.totalSpent || raw.total_spent || 0),
  monthSpent: Number(raw.monthSpent || raw.month_spent || 0),
  totalCount: Number(raw.totalCount || raw.total_count || 0)
})

`

content = content.slice(0, idx) + newFunctions + content.slice(idx)
fs.writeFileSync(filePath, content, 'utf8')
console.log('parent.ts updated with normalize functions')
