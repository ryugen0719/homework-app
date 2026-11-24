"""
Simple Autonomous Improvement Workflow
1つのメインエージェントが IMPLEMENT → RESEARCH → REVIEW → IMPROVE → TEST を
反復実行するシンプルな Antigravity Dynamic Workflow。

実行例 (run_workflow):
  ScriptPath: "c:/Users/Admin/project/homework-app/.agents/workflows/simple-improve.py"
  Args: {
    "max_iterations": 3,
    "focus": "all",          # "all" | "testing" | "security" | "performance" | "code-quality" | "ui-ux"
    "dry_run": false         # true の場合はコード変更せず計画・調査のみ実行
  }
"""

max_iterations = int(args.get("max_iterations", 3))
focus = str(args.get("focus", "all"))
dry_run = bool(args.get("dry_run", False))
max_rework = 2

SYSTEM_INSTRUCTIONS = """
あなたは homework-app のシニアエンジニアとして、シンプルな自律型改善サイクル
(IMPLEMENT → RESEARCH → REVIEW → IMPROVE → TEST) を1人で順番に実行する。

必ず最初に `.agents/skills/autonomous-improve/SKILL.md` と `docs/IMPROVEMENT-LOG.md` を読み、
以下の制約を厳守すること:
- 既存機能を壊さない
- 根拠のない変更をしない
- 一度に大量の変更をしない（1サイクル＝1テーマの小さな差分）
- テスト（最低限 `npm run lint` と `npx tsc --noEmit`、UI変更時はブラウザ確認）を通さず完了にしない
- デプロイ、git push、データ削除、認証方針の破壊的変更は実行せず needs_approval=true で停止する
- 既存の未コミット変更（ユーザー作業中ファイル）は上書きしない
- Next.js 16 固有の API を扱う場合は `node_modules/next/dist/docs/` を確認する
"""

# 単一のメインエージェントを作成（反復を通じてコンテキストを保持）
worker = agent(SYSTEM_INSTRUCTIONS, role="Autonomous Improvement Agent")

history = []

for i in range(1, max_iterations + 1):
    phase(f"Iteration {i}: Analyze & Research & Review")

    plan = await worker(
        f"""
[Iteration {i}/{max_iterations}] Focus: {focus} / DryRun: {dry_run}

ステップ 1〜4 を実行してください:
1. `git status` と `docs/IMPROVEMENT-LOG.md` および対象コードを確認し、現状を分析する。
2. 改善候補を発見し、最も効果が高く安全な「小さな1テーマ」を選定する。
3. 必要に応じて公式ドキュメントや Web で最新技術・実装事例を調査し、根拠を明確にする。
4. 既存機能への影響と、人間の事前確認が必要か（needs_approval）をレビューする。

改善候補がもうない場合は `has_candidate: false` を返してください。
※このステップではまだコードを変更しないでください。
""",
        schema={
            "type": "object",
            "properties": {
                "has_candidate": {"type": "boolean"},
                "needs_approval": {"type": "boolean"},
                "approval_reason": {"type": "string"},
                "title": {"type": "string"},
                "problem": {"type": "string"},
                "rationale": {"type": "string"},
                "target_files": {"type": "array", "items": {"type": "string"}},
                "verification_plan": {"type": "string"},
            },
            "required": [
                "has_candidate",
                "needs_approval",
                "title",
                "problem",
                "rationale",
                "target_files",
                "verification_plan",
            ],
        },
    )

    if not plan["has_candidate"]:
        log(f"[Iteration {i}] 改善候補がなくなったため終了します。")
        break

    log(f"[Iteration {i}] 選定テーマ: {plan['title']} (対象: {', '.join(plan['target_files'])})")

    if plan["needs_approval"]:
        log(f"[Iteration {i}] 事前確認が必要な重大変更のため停止します: {plan.get('approval_reason', '')}")
        history.append({"iteration": i, "status": "needs_approval", "plan": plan})
        break

    if dry_run:
        log(f"[Iteration {i}] dry_run=true のため実装をスキップします。")
        history.append({"iteration": i, "status": "dry_run", "plan": plan})
        continue

    # IMPROVE → TEST（失敗時は最大 max_rework 回まで再改善）
    passed = False
    last_result = None

    for attempt in range(0, max_rework + 1):
        phase(f"Iteration {i}: Improve & Test (Attempt {attempt + 1})")

        rework_note = (
            f"前回の検証で問題が残りました。原因を修正して再テストしてください。\n前回の結果: {last_result}"
            if attempt > 0
            else "計画どおり最小限の差分で実装し、検証を実行してください。"
        )

        last_result = await worker(
            f"""
[Iteration {i} / Attempt {attempt + 1}]
テーマ: {plan['title']}
{rework_note}

ステップ 5〜7 を実行してください:
5. 最小限の変更を実装する（対象ファイル: {plan['target_files']}）。
6. テストを実行する（`npm run lint`、`npx tsc --noEmit`、関連テスト、UI変更時はブラウザ確認）。
7. 改善前後の結果を評価し、問題が完全に解決したか判定する。
""",
            schema={
                "type": "object",
                "properties": {
                    "passed": {"type": "boolean"},
                    "changes_summary": {"type": "string"},
                    "test_results": {"type": "string"},
                    "before_after": {"type": "string"},
                    "remaining_issues": {"type": "string"},
                },
                "required": [
                    "passed",
                    "changes_summary",
                    "test_results",
                    "before_after",
                    "remaining_issues",
                ],
            },
        )

        if last_result["passed"]:
            passed = True
            log(f"[Iteration {i}] テスト通過: {last_result['test_results']}")
            break
        else:
            log(f"[Iteration {i}] Attempt {attempt + 1} 未達: {last_result['remaining_issues']}")

    phase(f"Iteration {i}: Log Result")
    await worker(
        f"""
ステップ 8 を実行してください:
`docs/IMPROVEMENT-LOG.md` に今回のサイクル結果を追記してください。
- 状態: {"完了" if passed else "未解決（要再検討）"}
- テーマ: {plan['title']}
- 発見した問題: {plan['problem']}
- 改善の根拠: {plan['rationale']}
- 実施した変更: {last_result['changes_summary']}
- テスト結果: {last_result['test_results']}
- 改善前後の比較: {last_result['before_after']}
- 未解決の問題: {last_result['remaining_issues']}
- 次回の改善候補も整理して記載してください。
""",
        schema={"type": "string"},
    )

    history.append({"iteration": i, "status": "passed" if passed else "unresolved", "plan": plan, "result": last_result})

del worker
log(f"ワークフロー完了（実行サイクル数: {len(history)}）")
print(history)
