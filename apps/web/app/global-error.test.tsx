import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GlobalError from "./global-error";

function render(error: Error & { digest?: string }): string {
	return renderToStaticMarkup(createElement(GlobalError, { error, reset: () => {} }));
}

describe("global error boundary", () => {
	it("shows a generic message and the digest, never the raw error message", () => {
		const error = Object.assign(new Error("database password leaked"), { digest: "digest-42" });
		const html = render(error);

		expect(html).toContain("Something went wrong");
		expect(html).toContain("digest-42");
		expect(html).not.toContain("database password leaked");
	});

	it("omits the reference when the digest is absent", () => {
		const html = render(new Error("internal detail"));

		expect(html).not.toContain("Reference:");
		expect(html).not.toContain("internal detail");
	});
});
