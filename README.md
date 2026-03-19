# FlowFocus

FlowFocus は、Next.js + TypeScript + Tailwind CSS + Supabase で構成した、GTD と project / next_action 運用を前提にした業務 Todo カンバンです。

## この版で強化したポイント

## PWA 対応
- `app/manifest.ts` による Web App Manifest を追加
- `public/sw.js` による最小 service worker を追加
- 右下の `インストール` 導線から、デスクトップやホーム画面へ追加可能
- iPhone / iPad は Safari の `ホーム画面に追加` を利用


### 1. 今日やるべきことが 3 秒で分かる
- Board の「今日」を `今やる1件 + 次にやる2件` に整理
- Project Detail / Projects / Viewer も同じ考え方で、最初に見る 1 件を先頭表示
- 回答予定日超過、期限超過、今日期限、待ち日付未設定、進行停滞を優先して先頭表示

### 2. 止まっている案件が自然に見つかる
- Board / Project Detail / Projects / Viewer に `止まり案件` を追加
- 件数だけでなく、理由付きカードで止まり方を見分けやすくした
- 停滞判定は共通ユーティリティに集約
  - 回答予定日超過
  - waiting だが回答予定日未設定
  - doing のまま 3 日以上更新なし
  - due_date 超過
  - project の次アクション未設定

### 3. 件数が増えても画面が重くなりにくい
- 検索は `useDeferredValue` を継続利用
- Board / Projects / Project Detail / Viewer で表示件数を段階描画
- 長い列や一覧は初期件数だけ描画し、`さらに N 件` で追加描画
- 集計・停滞判定・優先順位判定は共通関数へ寄せて再利用

### 4. 入力することで仕事が増えないようにする
- `待ち＋日付` の 1 クリックで waiting と回答予定日を同時設定
- Review モードで停滞案件 / Waiting超過 / 次アクション未設定 project を順に整理
- 一括操作でも回答予定日が未入力なら次営業日を自動提案
- 次営業日 / 3営業日のプリセットで日付入力を最小化
- `今やる1件 + 次にやる2件` と `止まり案件` は既存データから自動計算し、追加入力を要求しない

## 主な画面機能

### Board
- カンバン / 今日 / マトリクス / GTD 表示
- D&D による status 更新
- 複数選択と一括操作
- waiting 管理（回答予定日設定・超過・未設定可視化）
- 今やる1件 + 次にやる2件 / 止まり案件 / クイック選択

### Projects
- project 一覧、検索、並び替え、クイック絞り込み
- まず見る1件 + 次に見る2件
- 開始日未記録 / 期限未設定 / 次アクション未設定の確認
- 段階描画による一覧軽量化

### Project Detail
- project 情報編集
- linked next_action の追加
- 複数選択 / 一括操作
- Project 内の今やる1件 + 次にやる2件 / 止まり候補
- 列ごとの段階描画

### Viewer
- started_at ～ due_date のガントチャート
- 今日線
- まず見る1件 + 次に見る2件 / 止まり案件
- 段階描画によるガント行の軽量化
- 開始日未記録 / 期限未設定一覧

### 共通
- 通知 / 警告ストリップ
- ローカル履歴
- CSV / JSON エクスポート
- CSV は UTF-8 BOM 付きで Excel の文字化けを抑制

## 設計ルール
- `status` は進捗専用
- `gtd_category` は分類専用
- `project` も `tasks` の 1 レコード
- `started_at` は初回 doing 移行日時
- `waiting_response_date` は `status = waiting` のときだけ使用
- waiting 以外へ変わったら `waiting_response_date` はクリア
- Board / Matrix は `gtd_category = project` を表示しない
- Board / Project Detail のカードは全体クリックで編集モーダル
- 日付表示は `yyyy-m-d`

## 今回追加・更新した主なファイル
- `components/kanban-board.tsx`
- `app/projects/page.tsx`
- `app/projects/[id]/page.tsx`
- `app/projects/viewer/page.tsx`
- `lib/tasks/focus.ts`
- `lib/tasks/presentation.ts`
- `components/ui/alert-strip.tsx`
- `components/ui/export-actions.tsx`
- `components/ui/history-panel.tsx`
- `lib/tasks/export.ts`
- `lib/tasks/history.ts`
- `docs/operations.md`

## 補足
- 今回の追加は UI / localStorage ベースで、SQL 変更はありません。
- 履歴は端末ローカル保存のため、ブラウザを変えると引き継がれません。
- 停滞判定の厳しさを変えたい場合は `lib/tasks/focus.ts` の `isDoingStale` を調整してください。


## デザイン調整方針
- 最上段は判断専用バーとして、画面名・件数・主操作だけを残す
- 「今やる1件」は最も目立つカードにして、次点候補と見た目を分ける
- 色の役割は固定する（赤=危険、黄=注意、青=現在地/主操作、灰=補足、緑=完了）
- カード内の情報順は タイトル → 理由タグ → 日付 → Project → 担当に寄せる
- 履歴・通知/警告・補助一覧などの二次情報は折りたたみ前提にする


## 最終デザイン磨き込み
- 主役 / 準主役 / 脇役 の強弱を整理
- タグは状態・理由・属性の3系統に寄せて表示を簡素化
- 止まり案件は危険順で先頭に出る前提
- 履歴や補助一覧は折りたたみを基本にして一覧の集中を維持
