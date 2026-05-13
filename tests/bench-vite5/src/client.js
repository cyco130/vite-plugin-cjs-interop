import defaultImport1, { named } from "cjs-test-package";
import defaultImportX, { named as meh } from "cjs-test-package";
import defaultImport2, { named as renamed } from "cjs-test-package/wrapped.cjs";
import defaultImport3 from "cjs-test-package/synthetic.cjs";

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

assert(defaultImport1 === "default", "Default import is incorrect");
assert(named === "named", "Named import is incorrect");
assert(defaultImport2 === "default", "Default import is incorrect");
assert(renamed === "named", "Named import is incorrect");
assert(
	defaultImport3.named === "named",
	"Synthetic default import is incorrect",
);

console.log(meh);

document.getElementById("root").textContent = "All imports are correct!";
