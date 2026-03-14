FlowFocus PWA 版の適用手順

1. この ZIP の内容を既存プロジェクトのルートに上書き配置してください。
2. 追加対象
   - app/layout.tsx
   - app/manifest.ts
   - components/pwa-shell.tsx
   - public/sw.js
   - public/icons/*
   - README.md
   - docs/operations.md
3. PWA として使うには localhost または HTTPS で起動してください。
4. 開発時は次で確認できます。
   npm install
   npm run dev
5. ブラウザで開いたあと、表示される「インストール」ボタンからアプリ化できます。
6. iPhone / iPad の Safari はブラウザ標準の beforeinstallprompt がないため、共有メニューの「ホーム画面に追加」を使ってください。

補足
- 今回は依存ライブラリ追加なしです。
- localStorage の保存キーは変更していません。
- service worker は最小構成で、同一オリジンの画面と静的アセットを軽くキャッシュします。
