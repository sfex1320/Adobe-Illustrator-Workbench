/**
 * 印前检查：基于快照的只读规则引擎。纯函数，不修改文档。
 *
 * 如实边界：链接文件状态、叠印、文字溢出等需要宿主能力或无法从快照判断的项目，
 * 单列为“无法检查”而不是假报通过。
 */

import type { QueryRequest, QueryScope, Snapshot } from '@aiq/contracts';
import type { ObjectRef } from '@aiq/contracts';

export type IssueLevel = 'error' | 'warning' | 'info' | 'unchecked';

export interface PreflightIssue {
  rule: string;
  level: IssueLevel;
  message: string;
  /** 关联对象（点击定位发起查询）。 */
  objectIds: string[];
  /** 定位查询：null 表示无法定位（文档级问题）。 */
  locateQuery: QueryRequest | null;
}

const ANY_SCOPE: QueryScope = {
  kind: 'document',
  pierceGroups: true,
  pierceClipGroups: true,
  includeMaskPaths: true,
  includeHidden: true,
  includeLocked: true,
};

function textContainers(snapshot: Snapshot): ObjectRef[] {
  return snapshot.objects.filter(
    (o) => o.kind === 'text-point' || o.kind === 'text-area' || o.kind === 'text-path',
  );
}

export function runPreflight(snapshot: Snapshot): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  // R1 未转曲文字（生产风险）。
  const texts = textContainers(snapshot);
  if (texts.length > 0) {
    issues.push({
      rule: 'unconverted-text',
      level: 'info',
      message: `存在 ${texts.length} 个可编辑文字对象；是否转曲或嵌入字体应按印厂交付要求判断`,
      objectIds: texts.map((o) => o.objectId),
      locateQuery: {
        scope: ANY_SCOPE,
        target: 'objects',
        objectsFilter: { kinds: ['text-point', 'text-area', 'text-path'] },
      },
    });
  }

  // R2 RGB 颜色用于对象（印刷流程偏色风险）。
  const rgbUsers = snapshot.objects.filter((o) =>
    [o.fill, o.stroke].some((u) => u?.color.kind === 'rgb'),
  );
  if (rgbUsers.length > 0) {
    issues.push({
      rule: 'rgb-color-in-print',
      level: 'warning',
      message: `${rgbUsers.length} 个对象使用 RGB 颜色；CMYK 印刷流程可能偏色`,
      objectIds: rgbUsers.map((o) => o.objectId),
      locateQuery: null, // 按颜色定位需要具体 colorId，见视图的逐条定位。
    });
  }

  // R3 专色使用提示。
  const spotUsers = snapshot.objects.filter((o) =>
    [o.fill, o.stroke].some((u) => u?.color.kind === 'spot' || u?.color.kind === 'spot-tint'),
  );
  if (spotUsers.length > 0) {
    issues.push({
      rule: 'spot-colors',
      level: 'info',
      message: `${spotUsers.length} 个对象使用专色；确认印厂支持对应专色`,
      objectIds: spotUsers.map((o) => o.objectId),
      locateQuery: null,
    });
  }

  // R4 未使用色板（清理建议）。
  const unused = snapshot.swatches.filter((s) => s.usedObjectIds.length === 0);
  if (unused.length > 0) {
    issues.push({
      rule: 'unused-swatches',
      level: 'info',
      message: `${unused.length} 个色板未在已解析的对象填描中发现直接使用；不能据此判断可安全删除`,
      objectIds: [],
      locateQuery: null,
    });
  }

  // R5 未解析对象（内容未采集，无法保证检查完整性）。
  if (snapshot.coverage.skippedObjectCount > 0) {
    issues.push({
      rule: 'unresolved-objects',
      level: 'warning',
      message: `${snapshot.coverage.skippedObjectCount} 个对象内容未解析（符号/未知容器）；本报告不覆盖其内部`,
      objectIds: snapshot.skipped.map((s) => s.objectId),
      locateQuery: null,
    });
  }

  // R6 图片对象：链接状态无法从快照判断。
  const images = snapshot.objects.filter((o) => o.kind === 'image');
  if (images.length > 0) {
    issues.push({
      rule: 'image-links',
      level: 'unchecked',
      message: `${images.length} 个图片对象；链接缺失/过期需要宿主验证（当前适配器不支持）`,
      objectIds: images.map((o) => o.objectId),
      locateQuery: {
        scope: ANY_SCOPE,
        target: 'objects',
        objectsFilter: { kinds: ['image'] },
      },
    });
  }

  // R7 隐藏/锁定对象存在（输出可能漏掉或无法更新）。
  const hiddenOrLocked = snapshot.objects.filter((o) => o.hidden || o.locked);
  if (hiddenOrLocked.length > 0) {
    issues.push({
      rule: 'hidden-locked',
      level: 'info',
      message: `${hiddenOrLocked.length} 个隐藏/锁定对象；确认导出前状态`,
      objectIds: hiddenOrLocked.map((o) => o.objectId),
      locateQuery: null,
    });
  }

  issues.push({ rule: 'incomplete-preflight', level: 'unchecked', message: '尚未检查：缺失字体、文字溢出、有效图像分辨率、出血、叠印、总墨量、ICC 与 PDF/X 合规性；此报告不能作为印刷放行证明', objectIds: [], locateQuery: null });
  return issues;
}
