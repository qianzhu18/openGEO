"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1>页面加载失败</h1>
      <p className="muted mt-3">已保存的项目和原文仍在本机。重试加载页面。</p>
      <button className="button mt-6" onClick={reset}>
        重新加载
      </button>
    </main>
  );
}
