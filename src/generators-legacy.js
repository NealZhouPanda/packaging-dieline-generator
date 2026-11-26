// Compatibility shim: the former monolithic single-file generators have been
// decomposed into standalone modules. Keep these re-exports so existing
// imports continue to work while new code imports from the box registry.
export { generate0201 } from "./generator0201.js";
export { generateE005C } from "./generatorE005C.js";
export { generateC001GX } from "./generatorC001GX.js";
