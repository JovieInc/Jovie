import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/tests/utils/a11y";
import { AdminUserDetailDrawer } from "./AdminUserDetailDrawer";
import { adminUser, longContentUser, rtlUser } from "./adminUser.test-fixtures";

const mocks = vi.hoisted(() => ({
	copy: vi.fn<(value: string) => Promise<boolean>>(),
	success: vi.fn(),
	error: vi.fn(),
}));

vi.mock("@/hooks/useClipboard", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/hooks/useClipboard")>()),
	copyToClipboard: mocks.copy,
}));

vi.mock("@/components/feedback", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/components/feedback")>();
	return {
		...actual,
		toast: { ...actual.toast, success: mocks.success, error: mocks.error },
	};
});

// The shell drawer animates and portals; the rail contract under test is the
// labelled complementary region and its contents.
vi.mock("@/components/molecules/drawer/RightDrawer", () => ({
	RightDrawer: ({
		children,
		isOpen,
		ariaLabel,
	}: {
		children: ReactNode;
		isOpen: boolean;
		ariaLabel: string;
	}) => (isOpen ? <aside aria-label={ariaLabel}>{children}</aside> : null),
}));

describe("AdminUserDetailDrawer", () => {
	beforeEach(() => {
		mocks.copy.mockReset().mockResolvedValue(true);
		mocks.success.mockClear();
		mocks.error.mockClear();
	});

	it("renders the selected user summary, links and details", async () => {
		const { container } = render(
			<AdminUserDetailDrawer user={adminUser} onClose={vi.fn()} />,
		);
		const rail = screen.getByRole("complementary", { name: "User details" });
		expect(within(rail).getByText("Alex Rivera")).toBeInTheDocument();
		expect(within(rail).getByText("pro")).toBeInTheDocument();
		expect(within(rail).getByText("Active")).toBeInTheDocument();
		expect(
			screen.getByTestId("drawer-analytics-metric-value-profile-completeness"),
		).toHaveTextContent("80%");
		expect(
			screen.getByTestId("drawer-analytics-metric-value-linked-destinations"),
		).toHaveTextContent("2");
		expect(screen.getByRole("link", { name: "Spotify" })).toHaveAttribute(
			"href",
			"https://open.spotify.com/artist/alex",
		);
		expect(screen.getByRole("link", { name: "apple music" })).toHaveAttribute(
			"target",
			"_blank",
		);
		const details = screen.getByTestId("admin-user-details");
		expect(within(details).getByText("cus_123")).toBeInTheDocument();
		expect(within(details).getByText(/Jul 1, 2026/)).toBeInTheDocument();
		await expectNoA11yViolations(container);
	});

	it("copies the email and confirms with a toast", async () => {
		const user = userEvent.setup();
		render(<AdminUserDetailDrawer user={adminUser} onClose={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Copy Email" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Email copied", {
				duration: 2000,
			}),
		);
		expect(mocks.copy).toHaveBeenCalledWith("alex@example.com");
	});

	it("reports a failed copy of the user id", async () => {
		const user = userEvent.setup();
		mocks.copy.mockResolvedValue(false);
		render(<AdminUserDetailDrawer user={adminUser} onClose={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Copy User ID" }));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Failed to copy User ID"),
		);
		expect(mocks.copy).toHaveBeenCalledWith("user-1");
		expect(mocks.success).not.toHaveBeenCalled();
	});

	it("copies the clerk id from the details list", async () => {
		const user = userEvent.setup();
		render(<AdminUserDetailDrawer user={adminUser} onClose={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Copy Clerk ID" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Clerk ID copied", {
				duration: 2000,
			}),
		);
		expect(mocks.copy).toHaveBeenCalledWith("clerk-1");
	});

	it("closes from the header close button", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<AdminUserDetailDrawer user={adminUser} onClose={onClose} />);
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("runs a context menu action from the overflow menu", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(
			<AdminUserDetailDrawer
				user={adminUser}
				onClose={vi.fn()}
				contextMenuItems={[
					{
						type: "action",
						id: "suspend",
						label: "Suspend user",
						onClick: onSelect,
					},
				]}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "More actions" }));
		await user.click(
			await screen.findByRole("menuitem", { name: /Suspend user/ }),
		);
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("shows a deleted, unnamed user without an email or profile link", async () => {
		const { container } = render(
			<AdminUserDetailDrawer
				user={{
					...adminUser,
					name: null,
					email: null,
					profileUsername: null,
					stripeCustomerId: null,
					socialLinks: [],
					deletedAt: new Date("2026-08-15T09:30:00Z"),
				}}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByText("Unnamed user")).toBeInTheDocument();
		expect(screen.getByText("No email")).toBeInTheDocument();
		expect(screen.getAllByText("Deleted").length).toBeGreaterThan(0);
		expect(screen.getByText("None")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Copy Email" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByTestId("admin-user-profile-link"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("Social & music links")).not.toBeInTheDocument();
		await expectNoA11yViolations(container);
	});

	it("renders nothing when no user is selected", () => {
		render(<AdminUserDetailDrawer user={null} onClose={vi.fn()} />);
		expect(
			screen.queryByRole("complementary", { name: "User details" }),
		).not.toBeInTheDocument();
	});

	it("keeps long values truncated and caps the link list at eight", async () => {
		const { container } = render(
			<AdminUserDetailDrawer user={longContentUser} onClose={vi.fn()} />,
		);
		expect(screen.getByText(longContentUser.email ?? "")).toHaveClass(
			"truncate",
		);
		expect(screen.getByText(longContentUser.id)).toHaveClass("truncate");
		expect(
			screen.getAllByRole("link", { name: /A very long destination label/ }),
		).toHaveLength(8);
		await expectNoA11yViolations(container);
	});

	it("renders right-to-left names inside an rtl document", async () => {
		const { container } = render(
			<div dir="rtl" lang="ar">
				<AdminUserDetailDrawer user={rtlUser} onClose={vi.fn()} />
			</div>,
		);
		expect(screen.getByText("ليلى حداد")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "سبوتيفاي" })).toBeInTheDocument();
		await expectNoA11yViolations(container);
	});

	it("keeps the copy buttons at a 24px+ touch target", () => {
		render(<AdminUserDetailDrawer user={adminUser} onClose={() => {}} />);

		const copyEmail = screen.getByRole("button", { name: "Copy Email" });
		expect(copyEmail).toHaveClass("size-6");
	});
});
