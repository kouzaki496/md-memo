export function maxScrollTopFor(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

export function scrollRatioFor(el: HTMLElement): number {
  const max = maxScrollTopFor(el);
  return max <= 0 ? 0 : el.scrollTop / max;
}

/** 編集とプレビューでスクロール可能高さが違う前提で、スクロール位置を比率で写す */
export function applyProportionalScrollTop(from: HTMLElement, to: HTMLElement): void {
  const fromMax = maxScrollTopFor(from);
  const ratio = fromMax <= 0 ? 0 : from.scrollTop / fromMax;
  const toMax = maxScrollTopFor(to);
  to.scrollTop = ratio * toMax;
}
