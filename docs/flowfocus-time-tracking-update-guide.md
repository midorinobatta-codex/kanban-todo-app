# FlowFocus 工数・日次レビュー 改良版 適用ガイド

## この更新で入るもの

- 作業開始 / 作業終了ボタン
- セッション時間の累積
- 手動補正
- 日次レビュー表示
- CSV / JSON エクスポート拡張

## 置き換えるファイル

- `components/kanban-board.tsx`
- `lib/types.ts`
- `supabase.sql`

## 新規追加ファイル

- `lib/tasks/time-tracking.ts`

## DB変更

この更新は **DB変更あり** です。

`supabase.sql` を Supabase SQL Editor で **全文実行** してください。

追加される主な項目:

### tasks テーブル追加列
- `tracked_minutes`
- `manual_adjustment_minutes`
- `session_started_at`
- `waiting_response_date`（既存に無い場合のみ追加）

### 新規テーブル
- `task_work_sessions`

用途:
- タイマー終了時の実績ログ保存
- 手動補正ログ保存
- 日次レビュー集計
- AI向けエクスポート元データ

## 適用手順

1. 既存コードをバックアップ
2. 上記 3 ファイルを置換
3. `lib/tasks/time-tracking.ts` を追加
4. `supabase.sql` を全文実行
5. 動作確認

## build / 反映

通常のアプリ更新手順はこれです。

```bat
cd /d C:\FlowFocus
npm install
npm run build
xcopy /E /I /Y public .next\standalone\public
xcopy /E /I /Y .next\static .next\standalone\.next\static
```

その後、タスクを再実行するか、再ログインします。

## 確認ポイント

1. タスクカードに「作業開始」「作業終了」「補正」が出る
2. 開始すると別タスクは開始不可になる
3. 終了すると累積時間が増える
4. 補正でプラス / マイナス分が保存される
5. 左サイドバーに工数サマリーと日次レビューが出る
6. `工数CSV / 工数JSON / 日次CSV / 日次JSON` が出力できる

## 補足

- `started_at` は従来どおり **初回 doing 移行日時** のまま使います
- 今回の稼働中タイマーは `session_started_at` で管理します
- 累積値は `tracked_minutes + manual_adjustment_minutes` です
