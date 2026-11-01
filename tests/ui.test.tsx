import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "MutationObserver",
  "Node",
  "Event",
  "navigator",
] as const)
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
  });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  writable: true,
});
globalThis.fetch = async () =>
  new Response(JSON.stringify({ enabled: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
test("setup → two turns → pause → explanation → out → safe → history", async () => {
  const React = await import("react");
  const { render, fireEvent, waitFor, cleanup, within } =
    await import("@testing-library/react");
  const { App } = await import("../src/App");
  const screen = render(<App />);
  try {
    await waitFor(() =>
      assert.equal(
        (
          screen.getByRole("button", {
            name: "ゲームをはじめる",
          }) as HTMLButtonElement
        ).disabled,
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "ゲームをはじめる" }));
    fireEvent.change(screen.getByLabelText("連想した言葉"), {
      target: { value: "宇宙船" },
    });
    fireEvent.click(screen.getByRole("button", { name: "つなぐ" }));
    assert.ok(screen.getByText("プレイヤー2 の番"));
    fireEvent.change(screen.getByLabelText("連想した言葉"), {
      target: { value: "銀河" },
    });
    fireEvent.click(screen.getByRole("button", { name: "つなぐ" }));
    assert.ok(screen.getByText("プレイヤー3 の番"));
    fireEvent.click(screen.getByRole("button", { name: "一時停止・審議" }));
    assert.equal(
      screen.getAllByRole("button", { name: "アウトにする" }).length,
      2,
    );
    const cards = screen.getAllByRole("article");
    const first = within(cards[1]);
    fireEvent.click(first.getByRole("button", { name: "説明する" }));
    fireEvent.change(first.getByLabelText("どうして、その連想になった？"), {
      target: { value: "昨日見た動画の宇宙船がバナナの形だったから！" },
    });
    fireEvent.click(first.getByRole("button", { name: "説明を保存" }));
    assert.ok(
      first.getByText("「昨日見た動画の宇宙船がバナナの形だったから！」"),
    );
    fireEvent.click(first.getByRole("button", { name: "アウトにする" }));
    fireEvent.click(screen.getByRole("button", { name: /すべての履歴/ }));
    assert.ok(screen.getByText("参加者：アウト"));
    const outCard = screen.getAllByRole("article")[1];
    fireEvent.click(
      within(outCard).getByRole("button", { name: "セーフにする" }),
    );
    assert.ok(screen.getByText("参加者：セーフ"));
    fireEvent.click(screen.getByRole("button", { name: "ゲームを終了" }));
    assert.ok(screen.getByText("おつかれさまでした！"));
    await waitFor(() =>
      assert.ok(screen.getByRole("button", { name: /あそんだ記録/ })),
    );
    fireEvent.click(screen.getByRole("button", { name: /あそんだ記録/ }));
    await waitFor(() =>
      assert.ok(screen.getByText(/プレイヤー1・プレイヤー2・プレイヤー3/)),
    );
  } finally {
    cleanup();
  }
});
