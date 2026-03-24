import type { TaskGtdCategory, TaskProgress } from '@/lib/types';

export const MEETING_IMPORT_CANDIDATE_TYPES = ['next_action', 'waiting', 'project', 'someday'] as const;
export type MeetingImportCandidateType = (typeof MEETING_IMPORT_CANDIDATE_TYPES)[number];

export type MeetingImportCandidate = {
  id: string;
  title: string;
  type: MeetingImportCandidateType;
  reason: string;
};

export type MeetingImportPayload = {
  summary: string;
  candidates: MeetingImportCandidate[];
};

export type MeetingImportParseResult =
  | { ok: true; payload: MeetingImportPayload; warnings: string[] }
  | { ok: false; error: string };

export const MEETING_IMPORT_PROMPT = `以下の会議メモ・音声文字起こし・箇条書きメモを読み、FlowFocus に取り込みやすい候補だけを抽出してください。

目的:
- 自動保存ではなく、あとで人が採用する候補を作る
- 行動可能な候補を短いタイトルで返す
- 曖昧なら project 候補に寄せる
- 相手の返答待ち・依頼待ちは waiting 候補にする
- 今すぐ動かない案は someday 候補にする

出力ルール:
- JSON のみを返す
- JSON 以外の説明文や前置きは付けない
- candidates は 0〜10 件
- title は 12〜40 文字程度の短い日本語
- reason は 1 文で短く書く
- type は next_action / waiting / project / someday のどれかだけを使う

出力形式:
{
  "summary": "会議の要点を1〜3文で要約",
  "candidates": [
    {
      "title": "短い候補タイトル",
      "type": "next_action",
      "reason": "この分類にした理由"
    }
  ]
}

これから会議メモを貼ります。必要なら文脈を補ってよいですが、候補は保存前の提案に留めてください。`;

function normalizeCandidateType(value: unknown): MeetingImportCandidateType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'delegated') return 'waiting';
  if ((MEETING_IMPORT_CANDIDATE_TYPES as readonly string[]).includes(normalized)) {
    return normalized as MeetingImportCandidateType;
  }
  return null;
}

function extractJsonText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1).trim();
  }

  return null;
}

function makeCandidateId(candidate: Pick<MeetingImportCandidate, 'title' | 'type'>, index: number) {
  const slug = `${candidate.type}-${candidate.title}`
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${slug || 'candidate'}-${index + 1}`;
}

export function parseMeetingImportResponse(raw: string): MeetingImportParseResult {
  const jsonText = extractJsonText(raw);
  if (!jsonText) {
    return { ok: false, error: 'JSON が見つかりませんでした。ChatGPT の返答全文、または JSON 部分を貼り付けてください。' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'JSON 形式が崩れています。カンマや括弧、引用符を確認してください。' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'JSON の最上位は object である必要があります。' };
  }

  const summary = typeof (parsed as { summary?: unknown }).summary === 'string'
    ? (parsed as { summary: string }).summary.trim()
    : '';
  const candidatesValue = (parsed as { candidates?: unknown }).candidates;

  if (!Array.isArray(candidatesValue)) {
    return { ok: false, error: '必須キー candidates が配列ではありません。' };
  }

  const warnings: string[] = [];
  const normalizedCandidates = candidatesValue.flatMap((candidateValue, index) => {
    if (!candidateValue || typeof candidateValue !== 'object' || Array.isArray(candidateValue)) {
      warnings.push(`${index + 1}件目を読み飛ばしました（object ではありません）。`);
      return [];
    }

    const title = typeof (candidateValue as { title?: unknown }).title === 'string'
      ? (candidateValue as { title: string }).title.trim()
      : '';
    const reason = typeof (candidateValue as { reason?: unknown }).reason === 'string'
      ? (candidateValue as { reason: string }).reason.trim()
      : '';
    const type = normalizeCandidateType((candidateValue as { type?: unknown }).type);

    if (!title) {
      warnings.push(`${index + 1}件目を読み飛ばしました（title が空です）。`);
      return [];
    }

    if (!type) {
      warnings.push(`${index + 1}件目を読み飛ばしました（type が不正です）。`);
      return [];
    }

    return [{
      id: makeCandidateId({ title, type }, index),
      title,
      type,
      reason: reason || '会議メモから抽出された候補です。',
    } satisfies MeetingImportCandidate];
  });

  const dedupedCandidates = normalizedCandidates.filter((candidate, index, array) => (
    array.findIndex((item) => item.title === candidate.title && item.type === candidate.type) === index
  ));

  if (dedupedCandidates.length === 0) {
    return { ok: false, error: '候補が 0 件でした。会議メモ内の宿題・待ち・案件化したい事項が含まれているか確認してください。' };
  }

  if (dedupedCandidates.length !== normalizedCandidates.length) {
    warnings.push('重複していた候補を自動でまとめました。');
  }

  return {
    ok: true,
    payload: {
      summary,
      candidates: dedupedCandidates,
    },
    warnings,
  };
}

export function convertMeetingCandidateToTaskFields(type: MeetingImportCandidateType): {
  gtdCategory: TaskGtdCategory;
  status: TaskProgress;
} {
  if (type === 'next_action') return { gtdCategory: 'next_action', status: 'todo' };
  if (type === 'project') return { gtdCategory: 'project', status: 'todo' };
  if (type === 'someday') return { gtdCategory: 'someday', status: 'todo' };
  return { gtdCategory: 'delegated', status: 'waiting' };
}
