import type { Localized } from "./types";
const m = (zh: string, en: string, ja: string): Localized => ({
  "zh-CN": zh,
  en,
  ja,
});
export const messages: Record<string, Localized> = {
  INVALID_INPUT: m(
    "请求参数无效。",
    "Invalid request parameters.",
    "リクエストのパラメータが無効です。",
  ),
  NOT_FOUND: m(
    "未找到此资源。",
    "Resource not found.",
    "リソースが見つかりません。",
  ),
  PROFILE_REQUIRED: m(
    "请先保存个人档案。",
    "Save your profile first.",
    "先にプロフィールを保存してください。",
  ),
  VERSION_CONFLICT: m(
    "数据已更新，请刷新后重试。",
    "Data changed. Reload and try again.",
    "データが更新されました。再読み込みして再試行してください。",
  ),
  BUSY: m(
    "已有任务正在运行，请稍后重试。",
    "A task is running. Try again later.",
    "タスクが実行中です。後でもう一度お試しください。",
  ),
  SELECTION_REQUIRED: m(
    "请先确认频道或视频。",
    "Confirm a channel or video first.",
    "先にチャンネルまたは動画を選択してください。",
  ),
  PROVIDER_NOT_CONFIGURED: m(
    "请在服务端配置模型密钥。",
    "Configure the model key on the server.",
    "サーバーにモデルのキーを設定してください。",
  ),
  INVALID_MODEL_OUTPUT: m(
    "模型结果不完整，请重试。",
    "The model result is incomplete. Try again.",
    "モデルの結果が不完全です。再試行してください。",
  ),
  TASK_FAILED: m(
    "处理失败，请检查服务端配置或重试。",
    "Processing failed. Check server configuration or retry.",
    "処理に失敗しました。サーバー設定を確認するか、再試行してください。",
  ),
  SOURCE_FAILED: m(
    "此来源暂时无法获取或分析。",
    "This source could not be acquired or analyzed.",
    "このソースを取得または分析できませんでした。",
  ),
  INTERRUPTED: m(
    "服务已重启，请重新提交任务。",
    "The server restarted. Submit the task again.",
    "サーバーが再起動しました。タスクを再送信してください。",
  ),
  BRIEFING_FAILED: m(
    "视频已完成分析，汇总简报暂时不可用。请刷新重试。",
    "Videos were analyzed, but the briefing is unavailable. Refresh to retry.",
    "動画の分析は完了しましたが、ブリーフィングを生成できませんでした。更新して再試行してください。",
  ),
  FORBIDDEN: m(
    "此来源不允许访问。",
    "This origin is not allowed.",
    "このオリジンからのアクセスは許可されていません。",
  ),
};
export const emptyBriefing = m(
  "暂无完成分析的视频。",
  "No analyzed videos are available.",
  "分析済みの動画はまだありません。",
);
