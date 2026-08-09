const OPS = new Set(["+", "-", "×", "*", "÷", "/", "−", "–", "—", "x", "X", "%", "∗", "⋅"]);

function normalizeOp(op) {
  const map = {
    "×": "*",
    x: "*",
    X: "*",
    "÷": "/",
    "−": "-",
    "–": "-",
    "—": "-",
    "∗": "*",
    "⋅": "*",
  };
  return map[op] || op;
}

function applyOp(left, op, right) {
  switch (normalizeOp(op)) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? null : left / right;
    case "%":
      return right === 0 ? null : left % right;
    default:
      return null;
  }
}

function toIntAnswer(value) {
  if (value == null || Number.isNaN(value)) return null;
  const n = Math.round(value);
  return Math.abs(value - n) < 1e-9 ? n : null;
}

function flattenTokens(expression) {
  if (Array.isArray(expression)) {
    const out = [];
    for (const item of expression) {
      if (item == null) continue;
      if (typeof item === "object") {
        const op = item.operator ?? item.op;
        const num = item.number ?? item.value ?? item.n;
        if (op != null && String(op).trim() !== "") out.push(String(op).trim());
        if (num != null && String(num).trim() !== "") out.push(String(num).trim());
        continue;
      }
      const s = String(item).trim();
      if (s) out.push(s);
    }
    return out;
  }
  if (typeof expression === "string") {
    const out = [];
    const re = /(\d+)|([+\-−–—×÷*/xX%∗⋅])/g;
    let m;
    while ((m = re.exec(expression))) out.push(m[1] || m[2]);
    return out;
  }
  return [];
}

export function evaluateExpression(expression) {
  const tokens = flattenTokens(expression);
  if (tokens.length < 3 || tokens.length % 2 === 0) return null;
  if (!/^\d+$/.test(tokens[0])) return null;

  let value = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const right = tokens[i + 1];
    if (!OPS.has(op) || !/^\d+$/.test(right)) return null;
    value = applyOp(value, op, Number(right));
    if (value == null || Number.isNaN(value)) return null;
  }
  return toIntAnswer(value);
}

export function formatExpression(expression) {
  return flattenTokens(expression).join(" ");
}

export function answerFromQuestion(question) {
  if (!question || typeof question !== "object") return null;

  if (Array.isArray(question.answers) && question.answers.length) {
    const raw = String(question.answers[0] ?? "").trim();
    if (/^-?\d+(\.\d+)?$/.test(raw)) return String(Math.round(Number(raw)));
  }

  const value = evaluateExpression(question.expression);
  return value == null ? null : String(value);
}

export function questionKey(question) {
  if (!question) return "";
  if (question.id != null) return `id:${question.id}`;
  const expr = formatExpression(question.expression);
  const ans = Array.isArray(question.answers) ? String(question.answers[0] ?? "") : "";
  return expr || ans ? `q:${expr}|${ans}` : "";
}

/**
 * Browser-side: locate the live play question.
 * Digits are SVG paths; values come from React props/hooks (expression/answers).
 */
export function findQuestionInDom() {
  const fiberKeyOf = (node) =>
    Object.keys(node || {}).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
    );

  let best = null;
  const consider = (obj, scoreBonus = 0) => {
    if (!obj || typeof obj !== "object") return;
    const hasExpr = obj.expression != null && obj.expression !== "";
    const hasAnswers = Array.isArray(obj.answers) && obj.answers.length > 0;
    if (!hasExpr && !hasAnswers) return;
    if (Array.isArray(obj.expression) && obj.expression.length === 0) return;

    const score =
      scoreBonus +
      (hasAnswers ? 5 : 0) +
      (hasExpr ? 2 : 0) +
      (obj.id || obj._id ? 2 : 0) +
      (obj.rows != null ? 1 : 0) +
      (Array.isArray(obj.expression) ? 1 : 0);

    if (!best || score > best.score) {
      best = {
        score,
        question: {
          id: obj.id || obj._id || null,
          expression: obj.expression ?? null,
          answers: hasAnswers ? obj.answers.slice(0, 4) : null,
          rows: obj.rows ?? null,
        },
      };
    }
  };

  const inspectFiber = (fiber, depthBonus = 0) => {
    if (!fiber) return;
    const props = fiber.memoizedProps || fiber.pendingProps || {};
    consider(props.question, 4 + depthBonus);
    consider(props.currentQuestion, 4 + depthBonus);
    consider(props, depthBonus);

    let hook = fiber.memoizedState;
    for (let h = 0; h < 24 && hook; h += 1, hook = hook.next) {
      const state = hook.memoizedState;
      if (!state || typeof state !== "object") continue;
      consider(state.currentQuestion, 3 + depthBonus);
      consider(state.question, 3 + depthBonus);
      consider(state, 1 + depthBonus);
      if (state.state && typeof state.state === "object") {
        consider(state.state.currentQuestion, 3 + depthBonus);
        consider(state.state.question, 3 + depthBonus);
      }
    }
  };

  const walkDown = (fiber, depth = 0) => {
    if (!fiber || depth > 40) return;
    inspectFiber(fiber, Math.max(0, 3 - Math.floor(depth / 8)));
    walkDown(fiber.child, depth + 1);
    walkDown(fiber.sibling, depth + 1);
  };

  const seeds = [];
  const input =
    document.querySelector('input[placeholder="Enter answer"]') ||
    document.querySelector('input[placeholder="Enter Answer"]') ||
    document.querySelector('input[placeholder*="answer" i]');
  if (input) {
    for (let el = input, d = 0; el && d < 18; el = el.parentElement, d += 1) {
      seeds.push(el);
    }
  }

  // Broad scan — question tree is often a sibling of the answer input subtree.
  const seenEl = new Set();
  const queue = input ? [input, document.body] : [document.body];
  while (queue.length && seenEl.size < 6000) {
    const el = queue.shift();
    if (!el || seenEl.has(el)) continue;
    seenEl.add(el);
    seeds.push(el);
    if (el.children) {
      for (const child of el.children) queue.push(child);
    }
  }

  const seenFiber = new Set();
  for (const node of seeds) {
    const key = fiberKeyOf(node);
    if (!key) continue;
    let fiber = node[key];
    for (let up = 0; up < 120 && fiber; up += 1, fiber = fiber.return) {
      if (seenFiber.has(fiber)) continue;
      seenFiber.add(fiber);
      inspectFiber(fiber, up < 8 ? 2 : 0);
      // Explore siblings/children around play UI fibers.
      if (up < 12) walkDown(fiber.child, 0);
    }
  }

  return best?.question || null;
}
