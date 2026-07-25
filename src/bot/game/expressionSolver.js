function normalizeOp(op) {
  const map = {
    "×": "*",
    x: "*",
    X: "*",
    "÷": "/",
    "−": "-",
    "–": "-",
    "—": "-",
  };
  return map[op] || op;
}

/** Extract a simple binary DMAS expression from page text. */
export function extractExpression(text) {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ");
  const re = /(\d+)\s*([+\-−–—×÷*/xX])\s*(\d+)/g;
  const matches = [...cleaned.matchAll(re)];
  if (!matches.length) return null;

  const promptIdx = cleaned.search(/TYPE OUT YOUR ANSWER|Enter answer/i);
  let chosen = matches[matches.length - 1];
  if (promptIdx >= 0) {
    const beforePrompt = matches.filter((m) => m.index < promptIdx);
    if (beforePrompt.length) chosen = beforePrompt[beforePrompt.length - 1];
  }

  return {
    left: Number(chosen[1]),
    op: normalizeOp(chosen[2]),
    right: Number(chosen[3]),
    raw: chosen[0],
  };
}

export function evaluateExpression(expr) {
  if (!expr) return null;
  const { left, op, right } = expr;
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (right === 0) return null;
      return left / right;
    default:
      return null;
  }
}

export function answerFromPageText(text) {
  const expr = extractExpression(text);
  const value = evaluateExpression(expr);
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > 1e-9) return null;
  return String(rounded);
}
