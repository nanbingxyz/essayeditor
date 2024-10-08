export function debounce(func: Function, delay: number) {
  let timeoutId: NodeJS.Timeout | undefined
  return (...args: any[]) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
          func(...args)
      }, delay)
  }
}

export function getRelativeTime(date:Date) {
  const now: Date = new Date();
  const diff = now.getTime() - date.getTime(); // 差异（毫秒）

  // 转换为秒
  const seconds = Math.floor(diff / 1000);
  
  // 定义时间间隔（秒）
  const intervals = {
    month: 30 * 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    day: 24 * 60 * 60,
    hour: 60 * 60,
    minute: 60,
    second: 1
  };

  // 遍历间隔并返回适当的相对时间字符串
  for (let [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
    }
  }

  return 'just now';
}