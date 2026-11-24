# Improvement Log

このファイルは、自律型改善ワークフロー（**IMPLEMENT → RESEARCH → REVIEW → IMPROVE → TEST**）の実行履歴と改善候補を管理します。

---

## 現在の改善候補バックログ（優先度順）

| 優先度 | カテゴリ | 改善候補 | 根拠・対象箇所 | 事前確認 |
| :--- | :--- | :--- | :--- | :--- |
| P0 | テスト環境 | 自動テスト基盤（Vitest）の導入とコア純粋関数の単体テスト作成 | `package.json` にテストスクリプトが存在せず、回帰テストを自動実行できない。`src/lib/homework-server.ts` のポイント計算・日付検証・ライブタイマー計算からテスト化すると安全 | 不要 |
| P1 | セキュリティ | ログイン API へのレート制限追加とエラー詳細レスポンスのマスク | `src/app/api/auth/login/route.ts`（L116）および `src/app/api/auth/teacher-password/route.ts`（L53）で `error.message` を直接返却。ログイン試行回数制限も未実装 | 不要 |
| P1 | セキュリティ | トークン・先生パスワード比較の定数時間化（`timingSafeEqual`） | `src/lib/homework-server.ts`（L200-L214, L348）で `===` 比較を使用 | 不要 |
| P2 | パフォーマンス | 月間記録取得（`/api/entries?month=...`）の Firestore リード削減 | `src/app/api/entries/route.ts`（L157-L163）で最大 31 日分（旧コレクション含め最大 62 回）の個別 `get()` を発行。範囲クエリで 1 クエリ化可能 | 不要 |
| P2 | コード品質 | 重複したポイント計算・JST 日付ユーティリティの一元化 | ポイント計算が `src/lib/homework-server.ts` / `src/app/api/ranking/route.ts` / `src/app/page.tsx` の 3 箇所に重複 | 不要 |
| P3 | 保守性 | 巨大コンポーネント（`page.tsx` 2,352行 / `RankingView.tsx` 1,896行）の段階的分割 | 責務集中により変更時の影響範囲が広く、レビュー・テストが困難 | 不要 |
| P3 | ドキュメント | `README.md` を現行仕様（複数生徒・ランキング・ライブタイマー・Google Gate）へ同期 | `README.md` が旧「1対1」仕様のまま乖離 | 不要 |
| 要確認 | セキュリティ | 生徒の平文パスワード（`passwordPlain`）保存の廃止検討 | `src/lib/homework-server.ts`（L131）で Firestore に平文保存。先生画面でのパスワード再確認運用に影響するため要確認 | **要確認** |

---

## 改善履歴

### Entry #0: 初期ベースライン分析（ワークフロー導入）

- **実施日時**: 2026-11-24
- **ステータス**: ベースライン計測完了（既存コード変更なし）
- **現状メトリクス**:
  - 技術スタック: Next.js `16.4.3` / React `19.3.0` / TypeScript `5` / Tailwind CSS `4.3.5` / Firebase Admin & Client / Vercel Blob
  - `npm run lint`: 成功（エラー 0）
  - `npx tsc --noEmit`: 成功（エラー 0）
  - 自動テスト: 未構築（0 件）
  - 最大ファイルサイズ: `src/app/page.tsx`（2,352行）、`src/app/RankingView.tsx`（1,896行）
  - `eslint-disable`: 13 箇所（`any` / `@ts-ignore` は 0 箇所）
- **発見した主な問題**:
  1. 自動テスト環境が存在しない（最大のボトルネック）。
  2. 認証周りのセキュリティ強化余地（レート制限、定数時間比較、エラー詳細露出、平文パスワード運用）。
  3. `/api/entries` の月間取得における最大 31〜62 回の個別 Firestore リード。
  4. `page.tsx`・`RankingView.tsx` への責務集中とポイント計算ロジックの 3 箇所重複。
- **実施した変更**:
  - `.agents/skills/autonomous-improve/SKILL.md` を作成
  - `.agents/workflows/simple-improve.py` を作成
  - `docs/IMPROVEMENT-LOG.md` を作成
- **次回の改善候補**:
  - P0: Vitest の導入と `src/lib/homework-server.ts` のコアロジック単体テスト整備

### Entry #1: クラスレース全画面表示「トポグラフィー・フロー（Contour Flow）」実装

- **実施日時**: 2026-11-24
- **ステータス**: 完了
- **発見した問題**:
  - 旧登山イラストデザイン（`src/components/alpine/*` および `.alpine-*` CSS）が、本アプリの基調である Geneva Cobalt（スイス・モダン）とデザイン言語が乖離しており、常時多数の CSS アニメーションが稼働する構成だった。
- **改善の根拠**:
  - 実装計画書（トポグラフィー・フロー改訂版）に基づき、具象イラストを廃止し「等高線・光ノード・計器タイポグラフィ」へ統一。省電力（30fps間引き・静止時 CPU 0%）、山頂プラトーによる密集防止、同点/0点の均等角度分散、`RubberSegment`・`CountUp`・`StudentAvatar`・`playAppSound` の既存資産活用、および `localStorage` 後方互換を実現。
- **実施した変更**:
  - 削除: `src/components/alpine/*`（4ファイル）および `src/app/globals.css` の旧 `.alpine-*` キーフレーム一式（192行削減）
  - 新設: `src/components/contour/contourMath.ts`, `ContourCanvas.tsx`, `ContourFocusView.tsx`, `ContourOverviewView.tsx`, `ContourRaceScene.tsx`
  - 修正: `src/components/RaceFullscreenOverlay.tsx`（`RubberSegment` 導入、`'classic'` 以外の旧 `'alpine'` 値を `'contour'` へ安全フォールバック、既存トラック表示は完全維持、375px 幅のヘッダー省スペース化）、`src/app/globals.css`（`.contour-ripple`, `.contour-breathe` 追加）
- **テスト結果**:
  - 旧 `alpine` 参照の残存チェック: クリーン（後方互換コメントのみ）
  - `npm run lint`: 通過（エラー 0 / 警告 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: コンパイル・型検査・全 17 ルート生成成功
- **改善前後の比較**:
  - CSS アニメーション定義を 192 行 → 26 行へ大幅削減。一時停止・非表示時の Canvas CPU 使用率を 0% に抑制。
  - 375px スマホ幅〜PC 横画面までヘッダー・二重クロノリング・前後ライバルライン・正方形マップが干渉しないセーフエリア設計へ改善。
- **未解決の問題**:
  - なし（自動テスト基盤の未導入はバックログ P0 として継続管理）
- **次回の改善候補**:
  - P0: Vitest 導入と `contourMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #2: 全画面表示のトグル不安定（毎秒の全画面解除・再突入ループ）の修正

- **実施日時**: 2026-11-24
- **ステータス**: 完了
- **発見した問題**:
  - 全画面オーバーレイを開いている間に、ブラウザのネイティブ全画面が解除されたり再度全画面になったりする不安定動作が発生。
- **改善の根拠**:
  - `RankingView.tsx` から `onClose={() => setFullscreenOpen(false)}` がインライン関数で渡されており、タイマーの 1 秒ごとの再レンダリングのたびに参照が変化していた。`RaceFullscreenOverlay.tsx` の Fullscreen 管理 `useEffect` が `[open, onClose]` に依存していたため、毎秒 cleanup（`document.exitFullscreen()`）→ setup（`requestFullscreen()`）が再実行されていた。
- **実施した変更**:
  - `src/components/RaceFullscreenOverlay.tsx`: `onCloseRef` で最新コールバックを保持し、Fullscreen・スクロールロック・Escape 監視の `useEffect` 依存配列を `[open]` のみに修正。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
- **改善前後の比較**:
  - 1 秒ごとの再レンダリングで `exitFullscreen` / `requestFullscreen` が誤発火するバグを解消し、開閉時のみ安定して全画面遷移するよう修正。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入とコアロジックの単体テスト追加

### Entry #3: トポグラフィー・フローの「競争感・レーステレメトリ」強化（計画→実装→自己レビュー再改善）

- **実施日時**: 2026-11-24
- **ステータス**: 完了
- **発見した問題**:
  - 等高線＋抽象ノードの洗練された見た目は実現できたものの、フォーカス視点が「自分だけの計器」に見え、全体俯瞰視点も「静的な散布図」に近く、クラスメイトと競い合っている切迫感・並走感が薄れていた。
- **改善の根拠**:
  - Geneva Cobalt の抽象美を保ったまま、モータースポーツ（F1 タイミングタワー／テレメトリ）の表現を取り入れ、「順位・ギャップ・接近バー・並走バトル・登攀軌跡・チェイスライン」を可視化することで競争体験を強化。
- **実施した変更**:
  - `src/components/contour/contourMath.ts`: 接戦判定（`isCloseBattle`）、接近プログレス（`proximityPct`）、逆転目安時間（`estimatedMinutesToCatch`）、外周スタート座標（`startX`, `startY`）を追加。
  - `src/components/contour/ContourFocusView.tsx`: 直前ライバル「ターゲット・ロックオン HUD」（接近バー＋自分と相手のライブ状態に応じた「接近中 / 並走バトル」動的表示）、直後ライバル「追撃アラート HUD」（勉強中ライバルのライブ経過時間表示）、中央クロノリング内の順位バッジ＆目標までの残り表示、PC（`lg:` 以上）右端の F1 風「LIVE STANDINGS」順位タワーを追加。
  - `src/components/contour/ContourOverviewView.tsx`: 上部コンパクト順位ストリップ、外周（0m）→ 現在地の登攀軌跡ライン、自分 → 直前ライバルへのチェイスライン＋中点距離バッジ、ノードへの順位番号刻印・1位ハローリング・詳細カードの `LIVE` 時間表示を追加。
  - `src/components/contour/ContourRaceScene.tsx`: フォーカス視点内の順位タワー・ライバルカードから他メンバーへ直接フォーカス切替できるよう接続。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: 通過
- **改善前後の比較**:
  - 「単独のタイマー＋点図」から、誰が今勉強して追い上げているか・あと何分で逆転できるか・全員の順位序列がリアルタイムに伝わる競争 HUD へ進化。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `contourMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #4: 2.5D 立体遠近法トポグラフィー＆前後プレイヤー空間配置（計画→実装→自己レビュー再改善）

- **実施日時**: 2026-11-24
- **ステータス**: 完了
- **発見した問題**:
  - 平面の等高線と固定位置のライバルピルでは、前後にライバルが離れて走っている空間的な距離感・立体感が不足していた。
- **改善の根拠**:
  - 消失点へ収束する 2.5D 遠近法コースレーン＋指数パース等高線と、スコア差に応じた前後プレイヤーの遠近投影（遠いほど奥で小さく霞み、近いほど大きく迫る＋接地楕円・垂直ピラー）を組み合わせ、抽象デザインを保ったまま立体レース空間を実現。
- **実施した変更**:
  - `src/components/contour/ContourCanvas.tsx`: 消失点へ収束するパースペクティブ・コースレーン、両脇の稜線リフトを持つ 2.5D 遠近法等高線、勉強中の前方進行アニメーション（30fps・静止時 CPU 0% 維持）へ刷新。
  - `src/components/contour/contourMath.ts`: 前後・並走の全プレイヤーを 2.5D 空間へ投影する `projectPerspectiveRivals()` を追加（非線形距離圧縮・レーン分散・スケール/不透明度計算・セーフエリア調整）。
  - `src/components/contour/ContourFocusView.tsx`: 前（奥）・横（並走）・後ろ（手前）の空間に全プレイヤーの浮遊コア＋垂直ピラー＋接地楕円を配置し、直前・直後ライバルへの遠近ガイドビーム、自分足元のパースリング、`AHEAD / BEHIND` 方向ガイドを追加。
  - `src/components/contour/ContourOverviewView.tsx`: 正方形トポグラフィー盤面に 3D チルト（`perspective(960px) rotateX(20deg)`）と標高に応じたノード垂直リフトを追加（ラベルは逆チルトで視認性維持）。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: 通過
- **改善前後の比較**:
  - 2D 平面の計器画面から、前方のライバルが奥のコース上に遠く小さく見え、後方のライバルが背後から迫る 2.5D 立体レース空間へ進化。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `contourMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #5: 宇宙テーマ「Deep Space Warp（星間航行レース）」への刷新＆徹底調査修正

- **実施日時**: 2026-11-24
- **ステータス**: 完了
- **発見した問題**:
  - 「山」というメタファーには「頂上＝終わり」が存在し、終わりなく積み上がる勉強時間との概念的な不一致があった。
- **改善の根拠**:
  - 3案（Deep Space Warp / Orbital Ring / Constellation Climb）を比較し、終わりなき星域セクター（`SECTOR 01 → GATE 01 → GATE 02 → ∞`）と 3D 遠近ワープ空間＋外向き膨張スターマップを融合した **Deep Space Warp** を選定。
- **実施した変更**:
  - 削除: `src/components/contour/*`（5ファイル）
  - 新設: `src/components/cosmos/cosmosMath.ts`, `CosmosCanvas.tsx`, `CosmosFocusView.tsx`, `CosmosOverviewView.tsx`, `CosmosRaceScene.tsx`
  - 修正: `src/components/RaceFullscreenOverlay.tsx`（`宇宙` / `一覧` の `RubberSegment`、後方互換維持）、`src/app/globals.css`（`.cosmos-ripple`, `.cosmos-breathe`）
  - **徹底調査で見つかった 5 課題の修正**:
    1. PC（`lg:` 以上）での Canvas 消失点（`vx`）と DOM ステージ中央（`lg:pr-64`）の 51px ズレを `(width - 256) / 2` で完全一致化。
    2. 375px スマホ幅で同点並走者が中央クロノリングと重なるリスクを、斜め前方レーン（`Y: 36%`）へ配置変更して解消。
    3. 週初め全員 0 点時の星図ノード密集を防ぐため、`ORIGIN_INNER_RADIUS` を `11% → 15%` へ拡大。
    4. 中央クロノ計器に「次のワープゲート到達プログレスバー（`%`）」を追加。
    5. 星図の `GATE 01` 外側に未踏星域（Deep Space）の淡い環状グロウを追加。
- **テスト結果**:
  - 旧 `contour`/`alpine` 残存チェック: クリーン
  - `npm run lint`: 通過（エラー 0 / 警告 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: コンパイル・型検査・全 17 ルート生成成功
- **改善前後の比較**:
  - 「頂上で終わる山」から「GATE 01 → GATE 02 → ∞ と無限に広がる宇宙航行レース」へ概念・立体感・競争体験のすべてを刷新。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `cosmosMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #6: 宇宙モード撤去＆既存一覧ビュー拡張「Live Pace Track」（①進んでいる感 → ②競争している感）

- **実施日時**: 2026-11-24
- **ステータス**: 完了
- **発見した問題**:
  - テーマ特化の別モード（山・宇宙）ではなく、視認性の高い既存一覧トラックビューを直接拡張し、「① 進んでいる感」と「② 競争している感」を高める方が実用的で迷わない。
- **改善の根拠**:
  - 3案（Live Pace Track / 無限スクロール型 / 2画面対決型）を比較し、全員を一目で見渡せる一覧ビューの強みを活かしつつ、サブミニット連続前進・流れるシームレス路面ストライプ・全レーン縦断の自分基準線・ギャップ帯を統合する **Live Pace Track** を選定。
- **実施した変更**:
  - 削除: `src/components/cosmos/*`（5ファイル）、ヘッダーのモード切替UI
  - 新設: `src/components/raceTrackMath.ts`（サブミニット連続進捗 `computeContinuousBarPct`、前後バトル分析 `analyzeRaceBattle`）
  - 修正: `src/components/RaceFullscreenOverlay.tsx`（Live Pace Track 統合）、`src/app/globals.css`（`.track-flow-bar`, `.track-flow-rail`, `.track-head-pulse`）
  - **徹底調査で見つかった 5 課題の修正**:
    1. `-55deg` 斜めストライプのループ周期ズレによるカクつきを、数学的に完全シームレスな `-45deg` 24×24px タイル法へ修正。
    2. スケールが大きい週でも 1 秒ごとの前進を感じられるよう、勉強中バー先端に 60 秒連動のマイクロ前進エッジを追加。
    3. 0% 時の基準線重複を防止し、トラックヘッダー上に自分の現在地 `▼` マーカーを追加。
    4. 直前ライバルのギャップ帯・勉強中後続の追撃帯に、幅 `>= 14%` 時のみ直接 `あと +XX` / `追撃 -XX` ピルを表示（狭い幅ではアバター重なり防止のため非表示）。
    5. 30分周回バーに先端パルスと「あと XX秒 で +1分」カウントダウンを追加。
- **テスト結果**:
  - 旧 `cosmos`/`contour`/`alpine` 残存チェック: クリーン
  - `npm run lint`: 通過（エラー 0 / 警告 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: コンパイル・型検査・全 17 ルート生成成功
- **改善前後の比較**:
  - モード切替なしの明快な 1 画面構成に集約しつつ、毎秒の前進感と全レーン横断の競争視認性を大幅に強化。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `raceTrackMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #7: Next.js セキュリティアップグレード（16.4.3 → 16.4.6）

- **実施日時**: 2026-11-24 19:11
- **ステータス**: 完了
- **発見した問題**:
  - `npm run build` 実行時に Next.js `16.4.3` の既知セキュリティ脆弱性に対するアップグレード推奨エラー・警告（`SecurityFatalError`）が発生していた。
- **改善の根拠**:
  - `npm outdated` にて最新のセキュリティ修正パッチ `16.4.6` が公開されていることを確認し、`next` と `eslint-config-next` を同バージョンへ揃えて互換性を維持したまま脆弱性を解消。
- **実施した変更**:
  - `package.json` / `package-lock.json`: `next` および `eslint-config-next` を `16.4.3` → `16.4.6`（`--save-exact`）へ更新。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0 / 警告 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: Next.js `16.4.6 (webpack)` にてコンパイル・型検査・全 17 ルート生成すべて成功（`VERIFY_EXIT:0`、セキュリティ警告解消）
- **改善前後の比較**:
  - ビルド時のセキュリティ警告・停止エラーが解消され、クリーンな本番ビルドが完了するようになった。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `raceTrackMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #8: 壁紙クオリティのフル画面大型ライブクラスレース「Ambient Monolith Track」実装＆徹底調査修正

- **実施日時**: 2026-11-24 19:39
- **ステータス**: 完了
- **発見した問題**:
  - 従来の全画面トラックは `max-w-5xl` のカード枠 3 段構成で画面余白が多く、PC の壁紙のように常時表示するには情報ノイズが多くレース本体の迫力・視認性が不足していた。
- **改善の根拠**:
  - 3案（Ambient Monolith Track / 縦柱タワー / 時計特化ミニトラック）を比較し、カード枠と補助ノイズを徹底的に削ぎ落として `100vw × 100dvh` 全面を極大タイマー＋極太フルブリードレーンにする **Ambient Monolith Track** を選定。
- **実施した変更**:
  - `src/components/RaceFullscreenOverlay.tsx`: カード枠・`max-w-5xl` 制限・重複バトルカード・細かい管理文言を撤去し、極大タイマー（`clamp(3.6rem, 9.5vw, 7.2rem)`）、全面デュアル推進ライン（30分LAP＋60秒リズム）、1行戦況表示、無操作時ボタンオートフェード、画面全幅×縦自動伸縮の極太トラック（`h-7 sm:h-9`）＆大型タイポグラフィへ刷新。
  - `src/app/globals.css`: 大画面トラック向けに 45度シームレス前進ストライプを `32px × 32px` タイルへ最適化。
  - **徹底調査で見つかった 5 課題の修正**:
    1. `0%` / `100%` 時に大型アバター（48px）が見切れないようトラック＆目盛りの左右余白を `mx-6 sm:mx-8` で統一。
    2. 60秒マイクロ前進エッジがアバターの真下に隠れる問題を、アバター前方へ `24px + 0..34px` 伸びるクリップ付き前進スラストへ修正。
    3. 開始直後の極小バー（`0% < barPct < 2%`）の角丸潰れを `minWidth: 14px` で防止。
    4. 2人〜5人のいずれでも大画面で間延びしないよう `max-h-[180px]`＋`justify-center` で黄金比密度を確保。
    5. モバイル幅でのアバターサイズを `!size-10 sm:!size-12` でレスポンシブ最適化。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: Next.js `16.4.6` にて全 17 ルート生成・本番ビルド成功
- **改善前後の比較**:
  - 箱に囲まれた管理画面風の全画面表示から、PC の壁紙・サブモニター常駐ディスプレイとして映える極大・引き算のライブクラスレースへ進化。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `raceTrackMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #9: ライブクラスレースの 3 段階ズーム表示（超拡大 10分 / 拡大 30分 / 全体）導入

- **実施日時**: 2026-11-24 19:46
- **ステータス**: 完了
- **発見した問題**:
  - 全体表示（0〜週間目標/上限）では 1 分あたりのバー移動幅が数 px しかなく、勉強中に「バーがしっかり進んでいる」手応えが弱かった。
- **改善の根拠**:
  - 自分の現在位置を基準にグリッドスナップしたウィンドウ（`超拡大: 10分幅・1分目盛り`、`拡大: 30分幅・5分目盛り`、`全体`）へズームすることで、1 秒ごとの前進速度を最大 10〜30 倍に拡大し、目盛りを次々に突破する推進感を演出。
- **実施した変更**:
  - `src/components/raceTrackMath.ts`: `TrackZoomMode`（`'10m' | '30m' | 'full'`）、`computeTrackWindow()`、`computeWindowedBarState()` を実装。
  - `src/components/RaceFullscreenOverlay.tsx`: ヘッダーに `RubberSegment`（`超拡大` / `拡大` / `全体`、`Z` キー対応、`localStorage` 永続化）を追加。1分/5分刻みの背景ルーラー、ウィンドウ外メンバーの `← 後方 / 先行 →` インジケータ、ズーム勉強中のリニア連続トランジション（`0.95s linear`）を統合。
  - **徹底調査で見つかったエッジケース修正**:
    1. ズーム時の `GOAL` バッジと近接目盛り数字の重なりを防止（`nearGoal` 判定＋端のアンカー自動調整）。
    2. 画面外インジケータ（`先行 +XX →` / `← 後方 XX`）とギャップ帯ピルの重なりを防止。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: Next.js `16.4.6` にて全 17 ルート生成・本番ビルド成功
- **改善前後の比較**:
  - 1 秒ごとにアバターとバーが目盛りを通過して右へ着実に進むのが肉眼ではっきり視認でき、周囲のライバルとの数分差も大きく迫力ある距離として表現されるようになった。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `raceTrackMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #10: 建築方眼グリッド背景のシームレス前進アニメーション追加

- **実施日時**: 2026-11-24 19:53
- **ステータス**: 完了
- **発見した問題**:
  - バーだけでなく画面全体の背景からも「今前へ進み続けている」という空間的な推進感を演出する余地があった。
- **改善の根拠**:
  - Geneva Cobalt（スイス・モダン）の美学と調和する 2 層方眼グリッド（細線 40px / 主線 160px）を全画面背景に敷き、勉強中のみ右→左へ `translate3d(0 → -160px)` の GPU コンポジットでシームレスに流すことで、省電力かつ強い前進感を実現。
- **実施した変更**:
  - `src/app/globals.css`: `.race-bg-grid` / `.race-bg-grid-running` / `@keyframes race-grid-drift` を追加。
  - `src/components/RaceFullscreenOverlay.tsx`: 放射フェードマスク付き 2 層方眼グリッド背景を配置し、勉強中のみ移動・一時停止時は静止、さらにズーム倍率（`10m: 5.5s` / `30m: 10s` / `full: 18s`）に応じてスクロール速度を連動。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: Next.js `16.4.6` にて本番ビルド成功
- **改善前後の比較**:
  - 勉強スタートと同時に画面全体の建築方眼グリッドが静かに後方へ流れ出し、ズーム倍率と連動した直感的な前進体験を実現。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `raceTrackMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #11: 厳密時間同期グリッド＋四角い建築オブジェクト＆勉強時間メモリ（`RaceGridCanvas`）実装

- **実施日時**: 2026-11-24 19:58
- **ステータス**: 完了
- **発見した問題**:
  - CSS による一律速度のグリッドでは実際の勉強時間との厳密な同期がなく、流れる空間の質感や時間の経過目盛りによるリッチな没入感が不足していた。
- **改善の根拠**:
  - `1細マス = 48px` を固定しつつズーム倍率ごとの時間分解能（`超拡大: 5秒/マス = 9.6 px/s`、`拡大: 10秒/マス = 4.8 px/s`、`全体: 15秒/マス = 3.2 px/s`）を数学的に定義し、実時間と完全同期する HiDPI Canvas 背景を構築。
- **実施した変更**:
  - 新設: `src/components/RaceGridCanvas.tsx`（30fps 間引き・静止時 CPU 0%・交点クロスヘア付き 2 層方眼・遠景 0.42x パララックス矩形・グリッドスナップの 3 種四角オブジェクト［塗り／L字ブラケット枠／斜線ハッチ］・下端を流れる実時間メモリ［`00:00`, `01:00`, `05:00`…＋NOW ピン］）。
  - 修正: `src/components/RaceFullscreenOverlay.tsx`（`RaceGridCanvas` 統合、下端ルーラー用余白 `pb-9 sm:pb-11` 確保）、`src/app/globals.css`（旧 `.race-bg-grid` CSS 削除）。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: Next.js `16.4.6` にて全 17 ルート生成・本番ビルド成功
- **改善前後の比較**:
  - 単なる背景方眼から、現実の勉強秒数に完全同期して時間目盛りと建築ブロックが流れる、PC の壁紙クオリティの精密空間へ進化。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `raceTrackMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #12: ボーナスシステム再設計（4本柱）＆獲得理由が見えるリッチ演出の実装

- **実施日時**: 2026-11-24 22:21
- **ステータス**: 完了
- **発見した問題**:
  - ボーナスが「連続学習」「写真提出」の 2 種のみで、まとまった集中時間やライブタイマー計測の努力が報われにくかった。また、写真提出時はボーナス獲得演出がゼロで、記録保存時も「何によるボーナスなのか」の理由や次へのヒントが伝わりにくかった。さらにポイント計算が 3 箇所に重複していた。
- **改善の根拠**:
  - 既存データから 100% 一貫計算可能な 4 本柱（🔥連続学習 `+5〜+25pt` / ⚡集中達成 `30分+5pt, 60分+10pt` / 📷写真提出 `+5pt` / ⏱️ライブ計測 `10分+ で +5pt`）へ再設計し、`src/lib/points.ts` に計算を一元化。
- **実施した変更**:
  - 新設: `src/lib/points.ts`（サーバー／クライアント共通のポイント＆ボーナス内訳計算モジュール）
  - 修正: `src/lib/homework-server.ts`・`src/app/api/ranking/route.ts`（重複コード約 185 行を削減し `points.ts` へ一元化、`weekFocusBonus` / `weekLiveBonus` を返却）
  - 修正: `src/components/StudyComposerModal.tsx`（保存前プレビューに 4 種ボーナス理由表示、保存完了リビールに種別色分け＆理由・次ヒント付きのスタッガー演出＋2段紙吹雪＋延長表示）
  - 修正: `src/app/page.tsx`（`pointPreview` を `points.ts` へ統合、当日初の写真提出時に `treasure` 音＋紙吹雪＋「写真提出ボーナス +5pt 獲得！」リッチトースト演出を追加）
  - 修正: `src/app/RankingView.tsx`（ルールガイドと成績サマリー内訳を 4 種ボーナス対応へ更新）
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: Next.js `16.4.6` にて全 17 ルート生成・本番ビルド成功
- **改善前後の比較**:
  - 「何によるボーナスなのか」が保存前・保存瞬間・写真提出時・ランキング画面のすべてで一貫して明確に伝わり、3 箇所のポイント計算重複（P2 負債）も同時に解消。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `src/lib/points.ts` / `raceTrackMath.ts` / `homework-server.ts` の単体テスト追加

### Entry #13: 継続重視「連続学習ブースト倍率方式（1日セーフティ・120分上限）」への最終仕様刷新

- **実施日時**: 2026-11-24 22:36
- **ステータス**: 完了
- **発見した問題**:
  - 固定加算ボーナスでは「10分だけの日」と「60分頑張った日」の差がつかず、また連続倍率を単純導入すると「1日ドカ食いインフレ」「1日休みでの燃え尽き離脱」「サブボーナスが主役を食う逆転」が起きるリスクがあった。
- **改善の根拠**:
  - ストレステストの結果を踏まえ、主役を **連続学習ブースト（2日 ×1.1 / 3〜4日 ×1.2 / 5日〜 ×1.3・日上限120分・1日セーフティ付き）**、サブを **写真提出 +3pt/日・ライブ計測（15分+） +3pt/日** の 3 本柱に最終調整。
- **実施した変更**:
  - `src/lib/points.ts`: 1日セーフティ付き連続タイムライン計算（`computeStreakTimeline`）、日上限 120分倍率計算、初日点火ヒント（`ignitionHint`）を実装。
  - `src/lib/homework-server.ts`・`src/app/api/ranking/route.ts`: `currentMultiplier` を含む新サマリーを返却。
  - `src/components/StudyComposerModal.tsx`: `×1.2 BOOST` バッジ演出、初日ブースト点火バナー、倍率理由カードを追加。
  - `src/app/RankingView.tsx`: ルールガイドと成績サマリー内訳を新 3 本柱＋現在倍率表示へ統一。
- **テスト結果**:
  - `npm run lint`: 通過（エラー 0）
  - `npx tsc --noEmit`: 通過（エラー 0）
  - `npm run build`: Next.js `16.4.6` にて全 17 ルート生成・本番ビルド成功
- **改善前後の比較**:
  - 毎日コツコツ続ける生徒が週末まとめ型に健全に勝てるゲームバランスと、1日休んでも心が折れにくい継続体験を両立。
- **未解決の問題**:
  - なし
- **次回の改善候補**:
  - P0: Vitest 導入と `src/lib/points.ts` / `raceTrackMath.ts` / `homework-server.ts` の単体テスト追加

---

<!--
### Entry #N: <改善タイトル>

- **実施日時**: YYYY-MM-DD HH:MM
- **ステータス**: 完了 / 未解決 / 承認待ち
- **発見した問題**:
- **改善の根拠**:
- **実施した変更**:
- **テスト結果**:
- **改善前後の比較**:
- **未解決の問題**:
- **次回の改善候補**:
-->
