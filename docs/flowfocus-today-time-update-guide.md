# FlowFocus 今日画面向け時間計測アップデート

## この更新で追加されるもの
- タスクカード上の `作業開始` / `作業終了`
- 手動補正モーダル
- 今日画面の `今日の工数` パネル
- 今日画面の `日次レビュー` パネル
- 工数 CSV / JSON と日次レビュー CSV / JSON エクスポート

## 置き換えるファイル
- `components/kanban-board.tsx`
- `lib/types.ts`
- `lib/tasks/time-tracking.ts`
- `supabase.sql`

## 反映手順
1. ZIP を展開
2. 上記 4 ファイルを既存 FlowFocus に上書き
3. Supabase SQL Editor で `supabase.sql` を全文実行
4. `npx tsc --noEmit`
5. `npm run build`
6. いつもの更新手順を実行

```bat
cd /d C:\FlowFocus
npm install
npm run build
xcopy /E /I /Y public .next\standalone\public
xcopy /E /I /Y .next\static .next\standalone\.next\static
```

その後、タスクを再実行するか、再ログインします。

## 確認場所
- FlowFocus を開く
- 表示切替を `今日` にする
- タスクカードに `作業開始` または `作業終了` が出る
- 今日画面の上部に `今日の工数` と `日次レビュー` が出る

## 補足
- 1 回に同時稼働できるタスクは 1 件です
- 補正はマイナス値も入力できます
- 日次レビューの終業メモはブラウザの localStorage に保存されます
