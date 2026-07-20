(() => {
  const expressionEl = document.getElementById('expression');
  const resultEl = document.getElementById('result');
  const keypad = document.querySelector('.keypad');

  /**
   * Calculator state
   * - tokens: array of strings representing numbers and operators in order.
   * - lastAction: helps manage chaining behavior (e.g., after equals)
   */
  let tokens = [];
  let lastAction = 'input'; // 'input' | 'equals'

  const OPERATORS = new Set(['+', '-', '*', '/']);

  const isError = (val) => val === 'Error';

  const formatNumber = (value) => {
    if (!Number.isFinite(value)) return 'Error';

    // Avoid scientific notation for reasonable ranges.
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) {
      // Keep limited precision
      return value.toPrecision(12).replace(/\.0+($|e)/, '$1');
    }

    // Use up to 12 fractional digits, strip trailing zeros.
    return String(
      Math.round(value * 1e12) / 1e12
    ).replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'');
  };

  const render = (previewValue = null) => {
    const expr = tokens.join(' ');
    expressionEl.textContent = expr.length ? expr : '\u00A0';

    if (previewValue === null) {
      // Show current built number if any
      const last = tokens[tokens.length - 1];
      if (typeof last === 'string' && !OPERATORS.has(last)) {
        resultEl.textContent = last;
      } else {
        resultEl.textContent = tokens.length ? '0' : '0';
      }
      return;
    }

    resultEl.textContent = isError(previewValue) ? 'Error' : previewValue;
  };

  const canAppendDigitToNumber = () => {
    const last = tokens[tokens.length - 1];
    return last === undefined || !OPERATORS.has(last);
  };

  const getCurrentNumberToken = () => {
    const last = tokens[tokens.length - 1];
    if (last !== undefined && !OPERATORS.has(last)) return last;
    return '';
  };

  const appendDigit = (digit) => {
    if (lastAction === 'equals') {
      // Start fresh after equals if user types a digit.
      tokens = [];
      lastAction = 'input';
    }

    const last = tokens[tokens.length - 1];
    if (last !== undefined && !OPERATORS.has(last)) {
      // Avoid leading zeros like 0002 -> 2 (except for 0.x)
      if (last === '0') {
        tokens[tokens.length - 1] = digit === '0' ? '0' : digit;
      } else {
        tokens[tokens.length - 1] = last + digit;
      }
    } else {
      tokens.push(digit);
    }

    const preview = tryEvaluate();
    render(preview === null ? null : preview);
  };

  const appendDecimal = () => {
    if (lastAction === 'equals') {
      tokens = [];
      lastAction = 'input';
    }

    const current = getCurrentNumberToken();
    if (current.includes('.')) return;

    if (!canAppendDigitToNumber()) {
      tokens.push('0.');
    } else {
      if (current === '') tokens.push('0.');
      else tokens[tokens.length - 1] = current + '.';
    }

    const preview = tryEvaluate();
    render(preview === null ? null : preview);
  };

  const appendOperator = (op) => {
    if (lastAction === 'equals') {
      lastAction = 'input';
    }

    const last = tokens[tokens.length - 1];

    // If no tokens, allow starting with '-' only (not required by UI but helpful)
    if (tokens.length === 0) {
      if (op === '-') {
        tokens.push('-');
      }
      return;
    }

    // If last token is operator, replace it.
    if (OPERATORS.has(last)) {
      tokens[tokens.length - 1] = op;
    } else {
      tokens.push(op);
    }

    const preview = tryEvaluate();
    render(preview === null ? null : preview);
  };

  const clearAll = () => {
    tokens = [];
    lastAction = 'input';
    render('0');
  };

  const deleteLast = () => {
    if (lastAction === 'equals') {
      // After equals, delete should clear
      clearAll();
      return;
    }

    if (tokens.length === 0) return;

    const last = tokens[tokens.length - 1];
    if (!OPERATORS.has(last)) {
      const updated = last.slice(0, -1);
      if (updated === '' || updated === '-') tokens.pop();
      else tokens[tokens.length - 1] = updated;
    } else {
      tokens.pop();
    }

    const preview = tryEvaluate();
    if (tokens.length === 0) render('0');
    else render(preview === null ? null : preview);
  };

  const percent = () => {
    // Convert current number token into its percent value (n -> n/100)
    const last = tokens[tokens.length - 1];
    if (last === undefined) return;
    if (OPERATORS.has(last)) return;

    const num = Number(last);
    if (!Number.isFinite(num)) {
      render('Error');
      return;
    }

    const next = formatNumber(num / 100);
    if (next === 'Error') {
      render('Error');
      return;
    }

    tokens[tokens.length - 1] = next;
    const preview = tryEvaluate();
    render(preview === null ? null : preview);
  };

  const sanitizeExpressionForEval = (toks) => {
    // Since tokens are controlled by us, simple join is safe.
    // But we still guard against invalid sequences.
    return toks.join(' ');
  };

  const tryEvaluate = () => {
    // We only evaluate when the token sequence ends with a number.
    if (tokens.length === 0) return null;

    const last = tokens[tokens.length - 1];
    if (OPERATORS.has(last)) return null;

    // Basic validation: alternating number/operator
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const shouldBeOp = i % 2 === 1;
      if (shouldBeOp && !OPERATORS.has(tok)) return null;
      if (!shouldBeOp && OPERATORS.has(tok)) return null;
    }

    // Also guard division by zero at evaluation time.
    const expr = sanitizeExpressionForEval(tokens);

    try {
      // Evaluate using Function with strict whitelist.
      // Replace '×'/'÷' not needed because we use internal ops.
      const result = Function(`"use strict"; return (${expr});`)();

      if (!Number.isFinite(result)) return 'Error';
      return formatNumber(result);
    } catch {
      return 'Error';
    }
  };

  const equals = () => {
    const value = tryEvaluate();
    if (value === null) return;

    if (value === 'Error') {
      render('Error');
      tokens = [];
      lastAction = 'equals';
      return;
    }

    // After equals, replace tokens with the result as a single number.
    tokens = [value];
    lastAction = 'equals';
    render(value);
  };

  const handleButton = (btn) => {
    const action = btn.getAttribute('data-action');
    const value = btn.getAttribute('data-value');

    if (action === 'clear') return clearAll();
    if (action === 'delete') return deleteLast();
    if (action === 'percent') return percent();
    if (action === 'equals') return equals();

    if (value !== null) {
      if (/^\d$/.test(value)) return appendDigit(value);
      if (value === '.') return appendDecimal();
      if (OPERATORS.has(value)) return appendOperator(value);
    }
  };

  keypad.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    handleButton(btn);
  });

  const handleKey = (e) => {
    const key = e.key;

    // Digits
    if (/^\d$/.test(key)) {
      e.preventDefault();
      appendDigit(key);
      return;
    }

    if (key === '.') {
      e.preventDefault();
      appendDecimal();
      return;
    }

    // Operators
    if (key === '+' || key === '-' || key === '*' || key === '/') {
      e.preventDefault();
      appendOperator(key);
      return;
    }

    // Equals
    if (key === 'Enter' || key === '=') {
      e.preventDefault();
      equals();
      return;
    }

    // Delete / clear
    if (key === 'Backspace') {
      e.preventDefault();
      deleteLast();
      return;
    }

    if (key === 'Escape' || key === 'Delete') {
      e.preventDefault();
      clearAll();
      return;
    }

    // Percent
    if (key === '%') {
      e.preventDefault();
      percent();
      return;
    }
  };

  window.addEventListener('keydown', handleKey);

  // Initial render
  render('0');
})();

