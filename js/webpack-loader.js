// js/webpack-loader.js
// Loads a webpack "module file" (like your seeso.js / easy-seeso.js that begins with __webpack_require__...)
// by executing it inside a Function with a minimal webpack runtime.
//
// This avoids bundlers and works on GitHub Pages.

export async function loadWebpackModule(url, resolve) {
  const code = await fetch(url, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status} ${r.statusText}`);
    return r.text();
  });

  const __webpack_exports__ = {};

  function __webpack_require__(moduleId) {
    const resolved = resolve?.(moduleId);
    if (resolved !== undefined) return resolved;

    // The provided seeso.js imports core-js polyfills via __webpack_require__(...) calls.
    // For modern browsers, we can safely ignore them.
    return {};
  }

  // Define ES module marker
  __webpack_require__.r = (exports) => {
    if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    }
    Object.defineProperty(exports, "__esModule", { value: true });
  };

  // Define getter exports
  __webpack_require__.d = (exports, definition) => {
    for (const key in definition) {
      if (Object.prototype.hasOwnProperty.call(definition, key) &&
          !Object.prototype.hasOwnProperty.call(exports, key)) {
        Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
      }
    }
  };

  // Compatibility for non-harmony modules
  __webpack_require__.n = (module) => {
    const getter = module && module.__esModule
      ? () => module["default"]
      : () => module;
    __webpack_require__.d(getter, { a: getter });
    return getter;
  };

  // Global object getter
  __webpack_require__.g = (function() {
    if (typeof globalThis === "object") return globalThis;
    try { return this || new Function("return this")(); } catch { /* noop */ }
    if (typeof window === "object") return window;
    if (typeof self === "object") return self;
    return {};
  })();

  // Execute the module code in an isolated scope
  const fn = new Function("__webpack_exports__", "__webpack_require__", `${code}\n;return __webpack_exports__;`);
  return fn(__webpack_exports__, __webpack_require__);
}
