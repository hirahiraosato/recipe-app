/**
 * 分数文字列を小数に変換する
 * 対応形式: "1/2", "2/3", "1 1/2", "0.5", "2" など
 */
export function parseFraction(str: string): number | null {
  if (!str || !str.trim()) return null;
  const s = str.trim();

  // 帯分数: "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const result = parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
    return isNaN(result) ? null : result;
  }

  // 分数: "1/2", "2/3"
  const fraction = s.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denom = parseInt(fraction[2]);
    if (denom === 0) return null;
    return parseInt(fraction[1]) / denom;
  }

  // 整数・小数
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

/**
 * 小数を分数文字列に変換する（表示用）
 */
export function formatAmount(amount: number): string {
  if (amount === Math.floor(amount)) return String(amount);

  const fractions: [number, string][] = [
    [1 / 8,  "1/8"],
    [1 / 6,  "1/6"],
    [1 / 5,  "1/5"],
    [1 / 4,  "1/4"],
    [1 / 3,  "1/3"],
    [2 / 5,  "2/5"],
    [1 / 2,  "1/2"],
    [3 / 5,  "3/5"],
    [2 / 3,  "2/3"],
    [3 / 4,  "3/4"],
    [4 / 5,  "4/5"],
    [5 / 6,  "5/6"],
    [7 / 8,  "7/8"],
  ];

  for (const [val, str] of fractions) {
    if (Math.abs(amount - val) < 0.04) return str;
    if (amount > 1) {
      const whole = Math.floor(amount);
      const frac = amount - whole;
      if (Math.abs(frac - val) < 0.04) return `${whole} ${str}`;
    }
  }

  // 近い分数がなければ小数（末尾の .0 は除去）
  return amount.toFixed(1).replace(/\.0$/, "");
}
