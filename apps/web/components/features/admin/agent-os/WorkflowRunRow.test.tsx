import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/tests/utils/a11y";
import {
	buildArtifact,
	buildFailedArtifact,
	buildPendingApprovalArtifact,
	LONG_RUN_TITLE,
} from "./agentOsArtifact.test-fixtures";
import { WorkflowRunRow } from "./WorkflowRunRow";

describe("WorkflowRunRow", () => {
	it("calls onSelect with its artifact when the row is pressed", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		const artifact = buildArtifact();
		const { container } = render(
			<WorkflowRunRow artifact={artifact} onSelect={onSelect} />,
		);
		const row = screen.getByRole("button", {
			name: new RegExp(artifact.title),
		});
		expect(row).toHaveAttribute("aria-pressed", "false");
		await user.click(row);
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(artifact);
		await expectNoA11yViolations(container);
	});

	it("marks the selected row as pressed", () => {
		render(
			<WorkflowRunRow
				artifact={buildArtifact()}
				isSelected
				onSelect={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
	});

	it("opening a PR link does not select the row", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(<WorkflowRunRow artifact={buildArtifact()} onSelect={onSelect} />);
		const pr = screen.getByRole("link", {
			name: "Open PR (opens in a new tab)",
		});
		expect(pr).toHaveAttribute(
			"href",
			"https://github.com/JovieInc/Jovie/pull/19385",
		);
		expect(pr).toHaveAttribute("target", "_blank");
		expect(pr).toHaveAttribute("rel", "noopener noreferrer");
		pr.addEventListener("click", (event) => event.preventDefault());
		await user.click(pr);
		expect(onSelect).not.toHaveBeenCalled();
		expect(
			screen.getByRole("link", { name: "Open Linear (opens in a new tab)" }),
		).toHaveAttribute("href", "https://linear.app/jovieinc/issue/JOV-6778");
	});

	it("renders a read-only row without a button when onSelect is absent", async () => {
		const { container } = render(
			<WorkflowRunRow artifact={buildPendingApprovalArtifact()} />,
		);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.getByText("Review Required")).toBeInTheDocument();
		expect(screen.getByText("Review")).toBeInTheDocument();
		expect(screen.getByText("Jan 15, 12:00 PM UTC")).toBeInTheDocument();
		await expectNoA11yViolations(container);
	});

	it("drops links whose host, protocol or credentials are not allowed", () => {
		render(
			<WorkflowRunRow
				artifact={buildArtifact({
					pullRequestUrl: "http://github.com/JovieInc/Jovie/pull/1",
					linearIssueUrl: "https://evil.example.com/issue/1",
				})}
			/>,
		);
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("drops a link that carries credentials", () => {
		render(
			<WorkflowRunRow
				artifact={buildArtifact({
					// Joined at runtime so secret scanners don't read the inert fixture as a credential.
					pullRequestUrl: [
						"https://user",
						"pass@github.com/JovieInc/Jovie/pull/1",
					].join(":"),
					linearIssueUrl: null,
				})}
			/>,
		);
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("shows the failed status for an error run, axe-clean", async () => {
		const { container } = render(
			<WorkflowRunRow artifact={buildFailedArtifact()} onSelect={vi.fn()} />,
		);
		expect(screen.getByText("Failed")).toBeInTheDocument();
		await expectNoA11yViolations(container);
	});

	it("keeps long titles and an RTL document axe-clean", async () => {
		const { container } = render(
			<div dir="rtl">
				<WorkflowRunRow
					artifact={buildArtifact({ title: LONG_RUN_TITLE })}
					onSelect={vi.fn()}
				/>
			</div>,
		);
		expect(screen.getByText(LONG_RUN_TITLE)).toBeInTheDocument();
		await expectNoA11yViolations(container);
	});

	it("renders the human-gate badge with the AA status-text token", () => {
		render(<WorkflowRunRow artifact={buildPendingApprovalArtifact()} />);

		const badge = screen.getByText("Review Required");
		expect(badge).toHaveClass("text-warning-text");
		expect(badge).not.toHaveClass("text-warning");
	});
});
