import defaultImport, { named } from "cjs-test-package";
import assert from "assert";

assert(defaultImport === "default", "Default import is incorrect");
assert(named === "named", "Named import is incorrect");
