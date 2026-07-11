/// <reference types="@testing-library/jest-dom" />
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PromptBlock } from "../PromptBlock";

describe("PromptBlock", () => {
  it("renders the text and copies it on click", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PromptBlock label="Copy prompt" text="hello world" />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("hello world");
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent(/copied/i));
  });

  it("falls back to a select-and-copy affordance when the clipboard write rejects", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PromptBlock label="Copy prompt" text="hello world" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("hello world");
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent(/select & copy/i)
    );
  });
});
