/**
 * 北京时间工具函数
 * 统一处理 UTC → UTC+8 时区转换
 */

// 获取当前北京时间的 Date 对象（伪UTC时间，偏移+8小时使 toISOString() 输出北京时间）
function getBeijingNow() {
  return new Date(Date.now() + 8 * 3600000)
}

// 获取当前北京时间的日期字符串 (YYYY-MM-DD)
function getBeijingDateStr() {
  return getBeijingNow().toISOString().split('T')[0]
}

// 获取当前北京时间的完整时间字符串
function getBeijingDateTimeStr() {
  return getBeijingNow().toISOString().replace('T', ' ').replace(/\.\d+Z/, '')
}

// 将 UTC 时间字符串转为北京时间日期
function utcToBeijingDate(utcStr) {
  if (!utcStr) return ''
  const date = utcStr.split('T')[0]
  if (!utcStr.includes('T')) return date
  const parts = utcStr.split('T')[1]
  const utcHour = parseInt(parts.substring(0, 2))
  const min = parts.substring(3, 5)
  const beijingHour = ((utcHour + 8) % 24 + 24) % 24
  // 如果北京小时 < UTC 小时，说明跨了日期线
  if (beijingHour < utcHour) {
    const d = new Date(date + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  }
  return date
}

// 将 UTC 时间字符串转为北京时间时间
function utcToBeijingTime(utcStr) {
  if (!utcStr || !utcStr.includes('T')) return ''
  const parts = utcStr.split('T')[1]
  const utcHour = parseInt(parts.substring(0, 2))
  const min = parts.substring(3, 5)
  const beijingHour = ((utcHour + 8) % 24 + 24) % 24
  return String(beijingHour).padStart(2, '0') + ':' + min
}

// 判断日期是否在未来（相对于北京时间今天）
function isFutureDate(dateStr) {
  const todayStr = getBeijingDateStr()
  return dateStr > todayStr
}

// 初始化时间（兼容旧接口，无需实际操作）
async function initTime() {
  console.log(`[TZ] 使用北京时间偏移模式 (UTC+8)`)
  console.log(`[TZ] 当前北京时间: ${getBeijingDateStr()} ${getBeijingDateTimeStr().split(' ')[1]}`)
  return true
}

module.exports = {
  getBeijingNow,
  getBeijingDateStr,
  getBeijingDateTimeStr,
  utcToBeijingDate,
  utcToBeijingTime,
  isFutureDate,
  initTime,
}
