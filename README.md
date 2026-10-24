# 宿題ノート

先生と生徒が1対1で使う、宿題登録・提出確認アプリです。日付は日本時間で扱い、全画面を noindex にしています。写真提出はありません。

## セットアップ手順

Firebase の準備、ローカル起動、動作確認、Vercel 公開までの詳しい手順は [docs/はじめ方.md](docs/はじめ方.md) を参照してください。

## Firebase と Vercel の概要

1. Firebase Console でプロジェクトを作り、Firestore Database を有効にします。Firestore は本番モードで開始します。
2. Firestore の「ルール」に次を設定して公開クライアントの読み書きを拒否します。Admin SDK はこのルールを迂回し、サーバー API から操作します。

   ```text
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} { allow read, write: if false; }
     }
   }
   ```

3. Firebase のプロジェクト設定からプロジェクト ID を控え、サービスアカウントを作成します。秘密鍵は他人に共有せず、`.env.local` にだけ保存します。
4. プロジェクト直下に `.env.local` を作り、次の値を設定します。秘密鍵内の改行は `\n` として記述します。

   ```env
   TEACHER_TOKEN=ここに先生用ランダム文字列
   STUDENT_TOKEN=ここに生徒用ランダム文字列
   FIREBASE_PROJECT_ID=FirebaseのプロジェクトID
   FIREBASE_CLIENT_EMAIL=サービスアカウントのメールアドレス
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

5. トークンはそれぞれ別の長いランダム値にします。PowerShell で作る場合は `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` を2回実行します。先生用 URL は `/t/先生用トークン`、生徒用 URL は `/s/生徒用トークン` です。URL は秘密情報として本人以外に共有しないでください。
6. `npm run dev` を実行して先生用・生徒用 URL を確認します。公開前に値を Vercel の Project Settings → Environment Variables に登録します。
7. GitHub に push し、Vercel でリポジトリを Import して Deploy します。環境変数を変更した場合は再デプロイします。

## 現在の実装範囲

宿題登録、完了、履歴カレンダー、確認スタンプ、トークン照合 API、Firestore の日付単位保存、PWA マニフェストを含みます。写真提出はありません。
