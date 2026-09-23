/**
 * 演示适配器：用 fixtures 的结构化合成样例实现 HostAdapter。
 *
 * - 与真实适配器实现同一接口、复用同一查询和统计核心；
 * - 演示状态常显由 adapterKind='demo' 表达，失败不会静默切到演示数据；
 * - revision 模拟宿主内容变化：外部编辑后旧采集标记失效（B03）。
 */

import {
  CoreError,
  OBJECT_KIND_LABELS,
} from '@aiq/contracts';
import type {
  ApplySymmetryRequest,
  ApplyTextStyleRequest,
  ApplyTransformRequest,
  CommandResult,
  ColorDef,
  ColorUse,
  ConvertOutlinesRequest,
  DocumentContext,
  ExportFilesRequest,
  HostAdapter,
  HostInfo,
  ObjectRef,
  QueryScope,
  ReplaceObjectsRequest,
  SelectRequest,
  Snapshot,
  StoryInfo,
  SwatchEntry,
  TextSpanRef,
} from '@aiq/contracts';
import { graphemeCount, planTransform, mirrorPoints, boundsOfPoints } from '@aiq/core';
import type {
  DemoColorSpec,
  DemoDocumentSpec,
  DemoNodeSpec,
} from '@aiq/fixtures';
import { DEMO_DOCUMENTS } from '@aiq/fixtures';

const DEMO_CAPABILITIES_NOTE = '演示环境实现，未在真实 Illustrator 上验证';

function demoHostInfo(connected = true): HostInfo {
  return {
    adapterKind: 'demo',
    displayName: '演示适配器（合成样例）',
    connection: connected ? 'connected' : 'disconnected',
    hostName: '演示宿主',
    hostVersion: '1.0-demo',
    capabilities: {
      connect: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      readDocumentContext: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      readArtboards: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      collectSnapshot: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      selectObjects: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      sampleTextSpanFormats: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      documentChangeEvents: {
        supported: false,
        verifiedOnHost: false,
        note: '演示环境同样使用显式刷新与执行前复核',
      },
      persistentObjectId: {
        supported: true,
        verifiedOnHost: false,
        note: '演示样例内 ID 稳定；真实宿主未验证',
      },
      readPathPoints: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      writeTextStyles: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      transformObjects: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      replaceObjects: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      writePathPoints: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
      convertTextToOutlines: {
        supported: true,
        verifiedOnHost: false,
        note: '演示环境以字符边界矩形近似字形轮廓（真实宿主为字形轮廓），界面如实标注',
      },
      exportFiles: {
        supported: true,
        verifiedOnHost: false,
        note: '演示环境导出 JSON 报告文件（真实图片/PDF 导出需宿主）',
      },
      undoWrite: { supported: true, verifiedOnHost: false, note: DEMO_CAPABILITIES_NOTE },
    },
    limitations: [
      '数据来自固定合成样例，不代表真实 Illustrator 文档',
      '对象可见性按边界矩形与画板相交判断，不代表精确可见性',
      '写入操作真实修改内存中的演示文档数据，可通过一次撤销恢复',
    ],
  };
}

export class DemoHostAdapter implements HostAdapter {
  readonly kind = 'demo' as const;

  private documents: DemoDocumentSpec[];
  private revisions = new Map<string, number>();
  private collectionCounter = 0;
  private activeSessionId: string;
  private selectionIds = new Set<string>();
  /** 演示撤销栈：写入前压入文档深快照（JSON 安全数据）。上限 20 步。 */
  private undoStack: Array<{
    documents: DemoDocumentSpec[];
    activeSessionId: string;
    selectionIds: string[];
  }> = [];
  /** 实时对称会话基线：每帧先回到会话起点再应用新参数（源模型可重算、不累积）。 */
  private liveBaseline: DemoDocumentSpec[] | null = null;

  constructor(documents: DemoDocumentSpec[] = DEMO_DOCUMENTS) {
    // 深拷贝：写入操作修改的是本实例数据，不污染 fixtures 模块常量。
    this.documents = JSON.parse(JSON.stringify(documents)) as DemoDocumentSpec[];
    this.activeSessionId = this.documents[0]?.sessionId ?? '';
    for (const doc of this.documents) {
      this.revisions.set(doc.sessionId, 1);
      if (doc.initialSelectionIds.length > 0) {
        if (doc === documents[0]) {
          this.selectionIds = new Set(doc.initialSelectionIds);
        }
      }
    }
  }

  async getHostInfo(): Promise<HostInfo> {
    return demoHostInfo();
  }

  async connect(): Promise<HostInfo> {
    return demoHostInfo(true);
  }

  private activeSpec(): DemoDocumentSpec {
    const spec = this.documents.find((d) => d.sessionId === this.activeSessionId);
    if (!spec) {
      // 初始活动文档总是存在；防御性回退第一个。
      const fallback = this.documents[0];
      if (fallback) {
        this.activeSessionId = fallback.sessionId;
        return fallback;
      }
      throw new CoreError({ code: 'NO_DOCUMENT', message: '演示环境没有文档' });
    }
    return spec;
  }

  async getDocumentContext(): Promise<DocumentContext> {
    const spec = this.activeSpec();
    return {
      sessionId: spec.sessionId,
      name: spec.name,
      isOpen: true,
      flags: { unsavedChanges: spec.unsavedChanges },
      activeArtboardId: spec.artboards[0]?.id,
    };
  }

  async listDocuments(): Promise<DocumentContext[]> {
    return Promise.all(
      this.documents.map(async (spec) => ({
        sessionId: spec.sessionId,
        name: spec.name,
        isOpen: true,
        flags: { unsavedChanges: spec.unsavedChanges },
        activeArtboardId: spec.artboards[0]?.id,
      })),
    );
  }

  async setActiveDocument(sessionId: string): Promise<DocumentContext> {
    if (!this.documents.some((d) => d.sessionId === sessionId)) {
      throw new CoreError({
        code: 'SCOPE_INVALID',
        message: '演示环境中不存在该文档',
        detail: `sessionId=${sessionId}`,
      });
    }
    this.activeSessionId = sessionId;
    this.selectionIds.clear();
    return this.getDocumentContext();
  }

  // -----------------------------------------------------------------------
  // 快照编译

  async collectSnapshot(scope: QueryScope): Promise<Snapshot> {
    const spec = this.activeSpec();
    const revision = this.revisions.get(spec.sessionId) ?? 1;
    const collectionStamp = `${spec.sessionId}/r${revision}/c${++this.collectionCounter}`;

    const objects: ObjectRef[] = [];
    const textSpans: TextSpanRef[] = [];
    const storyContainers = new Map<string, string[]>();
    const skipped: Snapshot['skipped'] = [];

    const toColorUse = (role: ColorUse['role'], specColor: DemoColorSpec | undefined): ColorUse | undefined => {
      if (!specColor) return undefined;
      const color = this.toColorDef(spec, specColor);
      return { role, color };
    };

    const artboardIdsFor = (bounds: DemoNodeSpec['bounds']): string[] => {
      const ids: string[] = [];
      for (const ab of spec.artboards) {
        const intersects =
          bounds[0] < ab.bounds[2] && bounds[2] > ab.bounds[0] && bounds[1] < ab.bounds[3] && bounds[3] > ab.bounds[1];
        if (intersects) ids.push(ab.id);
      }
      return ids;
    };

    const walk = (
      node: DemoNodeSpec,
      path: string[],
      parentId: string | undefined,
      inside: { group: boolean; clip: boolean },
    ): void => {
      const label = node.name ?? OBJECT_KIND_LABELS[node.kind];
      const nodePath = [...path, label];
      const ref: ObjectRef = {
        docSessionId: spec.sessionId,
        objectId: node.id,
        kind: node.kind,
        name: node.name,
        hierarchicalPath: nodePath,
        parentId,
        bounds: node.bounds,
        artboardIds: artboardIdsFor(node.bounds),
        hidden: node.hidden === true,
        locked: node.locked === true,
        flags: {},
        fill: toColorUse('fill', node.fill),
        stroke: toColorUse('stroke', node.stroke),
      };
      // 路径点集：几何操作（对称等）的前提数据。
      if ((node.kind === 'path' || node.kind === 'compound-path') && node.points) {
        ref.pathPoints = node.points.map((p) => [p[0], p[1]] as [number, number]);
      }
      if (node.clipGroup) ref.flags.clipGroup = true;
      if (inside.group) ref.flags.insideGroup = true;
      if (inside.clip) ref.flags.insideClipGroup = true;
      if (node.unresolved) {
        ref.flags.unresolved = true;
        ref.flags.unresolvedReason = node.unresolved;
        skipped.push({ objectId: node.id, reason: node.unresolved, kind: node.kind });
      }
      objects.push(ref);

      // 文本片段展开（偏移按宿主 UTF-16 单位累计）。
      if (node.text && node.storyId) {
        let offset = 0;
        node.text.forEach((run, index) => {
          const hostLength = run.text.length;
          textSpans.push({
            docSessionId: spec.sessionId,
            spanId: `${node.id}#${index}`,
            storyId: node.storyId ?? node.id,
            containerObjectId: node.id,
            start: offset,
            end: offset + hostLength,
            offsetUnit: 'host',
            text: run.text,
            style: { ...run.style },
            hostUnitLength: hostLength,
            graphemeCount: graphemeCount(run.text),
          });
          offset += hostLength;
        });
        const containers = storyContainers.get(node.storyId) ?? [];
        containers.push(node.id);
        storyContainers.set(node.storyId, containers);
      }

      if (node.children) {
        for (const child of node.children) {
          if (node.clipGroup && child.id === node.clipMaskChildId) {
            // 蒙版路径子节点：标记归属关系。
          }
          walk(child, nodePath, node.id, {
            group: inside.group || node.kind === 'group',
            clip: inside.clip || node.clipGroup === true,
          });
        }
      }
    };

    for (const layer of spec.layers) {
      for (const child of layer.children) {
        walk(child, [layer.name], undefined, { group: false, clip: false });
      }
    }

    // 蒙版路径归属标记：剪切组的蒙版子节点。
    for (const layer of spec.layers) {
      for (const top of layer.children) this.markClipMasks(top, objects);
    }

    // 色板库存与直接使用统计。
    const directUses = new Map<string, string[]>();
    const noteUse = (colorId: string, objectId: string): void => {
      const list = directUses.get(colorId) ?? [];
      list.push(objectId);
      directUses.set(colorId, list);
    };
    for (const obj of objects) {
      if (obj.fill && obj.fill.color.colorId.startsWith('sw:')) noteUse(obj.fill.color.colorId, obj.objectId);
      if (obj.stroke && obj.stroke.color.colorId.startsWith('sw:')) noteUse(obj.stroke.color.colorId, obj.objectId);
    }
    const swatches: SwatchEntry[] = spec.swatches.map((sw) => ({
      colorId: `sw:${sw.id}`,
      name: sw.name,
      kind: sw.kind,
      values: sw.values,
      usedObjectIds: (directUses.get(`sw:${sw.id}`) ?? []).sort(),
      registeredAsSwatch: true,
    }));

    const gradients = spec.gradients.map((gr) => ({
      gradientId: gr.id,
      name: gr.name,
      kind: gr.kind === 'freeform' ? ('unknown' as const) : gr.kind,
      stops: gr.stops.map((stop) => ({
        offset: stop.offset,
        colorId: `sw:${stop.swatchId}`,
        midpoint: stop.midpoint ?? 50,
      })),
      unresolvedReason: gr.kind === 'freeform' ? '自由渐变类型暂不支持解析' : undefined,
    }));

    const stories: StoryInfo[] = [...storyContainers.entries()].map(([storyId, containerObjectIds]) => ({
      storyId,
      containerObjectIds,
    }));

    const textContainerIds = new Set(textSpans.map((s) => s.containerObjectId));
    const skippedObjectIds = new Set(skipped.map((s) => s.objectId));

    return {
      docSessionId: spec.sessionId,
      docName: spec.name,
      collectionStamp,
      collectedAtIso: new Date().toISOString(),
      scope,
      artboards: spec.artboards.map((ab) => ({ id: ab.id, name: ab.name, bounds: ab.bounds })),
      objects,
      textSpans,
      stories,
      swatches,
      gradients,
      skipped,
      coverage: {
        supportedObjectCount: objects.filter((o) => !skippedObjectIds.has(o.objectId)).length,
        skippedObjectCount: skipped.length,
        textContainerCount: textContainerIds.size,
        textSpanCount: textSpans.length,
        notes: skipped.length
          ? ['存在内容未解析对象：符号实例与未知容器按原样列出，不假报其内部内容']
          : [],
      },
      selectionObjectIds: [...this.selectionIds],
    };
  }

  private markClipMasks(node: DemoNodeSpec, objects: ObjectRef[]): void {
    if (node.clipGroup && node.clipMaskChildId) {
      const mask = objects.find((o) => o.objectId === node.clipMaskChildId);
      if (mask) mask.flags.clipPathFor = node.id;
    }
    for (const child of node.children ?? []) this.markClipMasks(child, objects);
  }

  private toColorDef(spec: DemoDocumentSpec, specColor: DemoColorSpec): ColorDef {
    if ('none' in specColor) {
      return { colorId: 'none', kind: 'none' };
    }
    if ('swatch' in specColor) {
      const sw = spec.swatches.find((s) => s.id === specColor.swatch);
      if (!sw) {
        return { colorId: `sw:${specColor.swatch}`, kind: 'unknown', unresolvedReason: '色板引用缺失' };
      }
      return {
        colorId: `sw:${sw.id}`,
        kind: sw.kind,
        name: sw.name,
        values: sw.values,
      };
    }
    if ('gradient' in specColor) {
      const gr = spec.gradients.find((g) => g.id === specColor.gradient);
      return {
        colorId: `grad:${specColor.gradient}`,
        kind: 'gradient',
        gradientId: specColor.gradient,
        name: gr?.name,
        unresolvedReason: gr?.kind === 'freeform' ? '自由渐变类型暂不支持解析' : undefined,
      };
    }
    if ('tintOf' in specColor) {
      const sw = spec.swatches.find((s) => s.id === specColor.tintOf);
      return {
        colorId: `tint:${specColor.tintOf}:${specColor.tintPercent}`,
        kind: 'spot-tint',
        name: `${sw?.name ?? specColor.tintOf} ${specColor.tintPercent}%`,
        values: sw?.values,
      };
    }
    if ('rgb' in specColor) {
      return { colorId: `rgb:${specColor.rgb.join(',')}`, kind: 'rgb', values: specColor.rgb };
    }
    if ('unresolved' in specColor) {
      return { colorId: 'unresolved', kind: 'unknown', unresolvedReason: specColor.unresolved };
    }
    return { colorId: 'unresolved', kind: 'unknown', unresolvedReason: '未知颜色形态' };
  }

  // -----------------------------------------------------------------------
  // 演示选择

  async selectObjects(request: SelectRequest): Promise<CommandResult> {
    const spec = this.validateSession(request.docSessionId, request.expectedCollectionStamp);

    const selected: string[] = [];
    const skipped: CommandResult['skipped'] = [];
    for (const id of request.objectIds) {
      const obj = this.findNode(spec, id);
      if (!obj) {
        skipped.push({ objectId: id, reason: '对象不存在或引用失效' });
        continue;
      }
      if (obj.hidden) {
        skipped.push({ objectId: id, reason: '对象已隐藏；不自动取消隐藏' });
        continue;
      }
      if (obj.locked) {
        skipped.push({ objectId: id, reason: '对象已锁定；不自动解锁' });
        continue;
      }
      selected.push(id);
    }
    this.selectionIds = new Set(selected);
    return {
      status: selected.length === request.objectIds.length ? 'completed' : selected.length > 0 ? 'partial' : 'failed',
      selectedObjectIds: selected,
      skipped,
      sideEffects: ['selection'],
    };
  }

  private parseRevision(stamp: string): number {
    const match = /\/r(\d+)\//.exec(stamp);
    return match ? Number(match[1]) : NaN;
  }

  /** 写入/选择共用的会话与采集标记校验。 */
  private validateSession(docSessionId: string, expectedStamp?: string): DemoDocumentSpec {
    const spec = this.activeSpec();
    if (docSessionId !== spec.sessionId) {
      throw new CoreError({
        code: 'DOC_SESSION_MISMATCH',
        message: '文档已切换，引用失效',
        detail: `请求文档 ${docSessionId}，当前 ${spec.sessionId}`,
      });
    }
    if (expectedStamp) {
      const expectedRevision = this.parseRevision(expectedStamp);
      const currentRevision = this.revisions.get(spec.sessionId) ?? 1;
      if (expectedRevision !== currentRevision) {
        throw new CoreError({
          code: 'REF_STALE',
          message: '演示文档内容已变化（revision 变更），引用过期；请重新查询',
          detail: `引用基于 r${expectedRevision}，当前 r${currentRevision}`,
        });
      }
    }
    return spec;
  }

  // -----------------------------------------------------------------------
  // 写入（真实修改演示文档数据；写入前压入撤销栈，成功后 revision 递增使旧引用失效）

  private pushUndo(): void {
    this.undoStack.push({
      documents: JSON.parse(JSON.stringify(this.documents)) as DemoDocumentSpec[],
      activeSessionId: this.activeSessionId,
      selectionIds: [...this.selectionIds],
    });
    if (this.undoStack.length > 20) this.undoStack.shift();
  }

  private bumpRevision(spec: DemoDocumentSpec): void {
    const current = this.revisions.get(spec.sessionId) ?? 1;
    this.revisions.set(spec.sessionId, current + 1);
  }

  async applyTextStyles(request: ApplyTextStyleRequest): Promise<CommandResult> {
    const spec = this.validateSession(request.docSessionId, request.expectedCollectionStamp);
    const skipped: CommandResult['skipped'] = [];
    const appliedContainers = new Set<string>();
    let applied = 0;

    for (const change of request.changes) {
      const sep = change.spanId.lastIndexOf('#');
      const containerId = sep > 0 ? change.spanId.slice(0, sep) : '';
      const runIndex = sep > 0 ? Number(change.spanId.slice(sep + 1)) : NaN;
      const node = containerId ? this.findNode(spec, containerId) : undefined;
      const run = node?.text?.[Number.isInteger(runIndex) ? runIndex : -1];
      if (!node || !run) {
        skipped.push({ objectId: change.spanId, reason: '片段引用失效' });
        continue;
      }
      if (node.hidden || node.locked) {
        skipped.push({ objectId: change.spanId, reason: '容器已隐藏或锁定；不自动解锁' });
        continue;
      }
      if (applied === 0) this.pushUndo();
      if (change.fontFamily !== undefined) run.style.fontFamily = change.fontFamily;
      if (change.fontStyle !== undefined) run.style.fontStyle = change.fontStyle;
      if (change.fontSizePt !== undefined) run.style.fontSizePt = change.fontSizePt;
      applied += 1;
      appliedContainers.add(containerId);
    }
    if (applied > 0) this.bumpRevision(spec);
    return {
      status: applied === request.changes.length ? 'completed' : applied > 0 ? 'partial' : 'failed',
      selectedObjectIds: [...appliedContainers],
      skipped,
      sideEffects: applied > 0 ? ['text-style-write'] : [],
      undoable: applied > 0,
    };
  }

  async applyTransforms(request: ApplyTransformRequest): Promise<CommandResult> {
    const spec = this.validateSession(request.docSessionId, request.expectedCollectionStamp);
    const skipped: CommandResult['skipped'] = [];
    const applied: string[] = [];

    for (const transform of request.transforms) {
      const node = this.findNode(spec, transform.objectId);
      if (!node) {
        skipped.push({ objectId: transform.objectId, reason: '对象引用失效' });
        continue;
      }
      if (node.hidden || node.locked) {
        skipped.push({ objectId: transform.objectId, reason: '对象已隐藏或锁定；不自动解锁' });
        continue;
      }
      if (applied.length === 0) this.pushUndo();
      const newBounds = planTransform(node.bounds, transform.targetBounds, transform.keepProportions);
      this.scaleNodeTo(node, newBounds);
      applied.push(node.id);
    }
    if (applied.length > 0) this.bumpRevision(spec);
    return {
      status: applied.length === request.transforms.length ? 'completed' : applied.length > 0 ? 'partial' : 'failed',
      selectedObjectIds: applied,
      skipped,
      sideEffects: applied.length > 0 ? ['transform'] : [],
      undoable: applied.length > 0,
    };
  }

  /** 把节点几何（bounds 与点集）按新边界等比映射。 */
  private scaleNodeTo(node: DemoNodeSpec, newBounds: [number, number, number, number]): void {
    const oldBounds = node.bounds;
    const oldW = oldBounds[2] - oldBounds[0];
    const oldH = oldBounds[3] - oldBounds[1];
    if (oldW > 0 && oldH > 0 && node.points) {
      const sx = (newBounds[2] - newBounds[0]) / oldW;
      const sy = (newBounds[3] - newBounds[1]) / oldH;
      node.points = node.points.map(
        (p) => [newBounds[0] + (p[0] - oldBounds[0]) * sx, newBounds[1] + (p[1] - oldBounds[1]) * sy] as [number, number],
      );
    }
    node.bounds = [newBounds[0], newBounds[1], newBounds[2], newBounds[3]];
  }

  async replaceObjects(request: ReplaceObjectsRequest): Promise<CommandResult> {
    const spec = this.validateSession(request.docSessionId, request.expectedCollectionStamp);
    const source = this.findNode(spec, request.sourceObjectId);
    if (!source) {
      throw new CoreError({ code: 'REF_STALE', message: '来源对象引用失效，请重新选择' });
    }
    const skipped: CommandResult['skipped'] = [];
    const created: string[] = [];
    let copySeq = 0;

    if (request.mode === 'swap') {
      const firstTarget = this.findNode(spec, request.targetObjectIds[0] ?? '');
      if (!firstTarget) {
        throw new CoreError({ code: 'REF_STALE', message: '替换目标引用失效，请重新选择' });
      }
      this.pushUndo();
      const a = [...firstTarget.bounds] as [number, number, number, number];
      const b = [...source.bounds] as [number, number, number, number];
      this.scaleNodeTo(source, a);
      this.scaleNodeTo(firstTarget, b);
      created.push(source.id, firstTarget.id);
      this.bumpRevision(spec);
      return {
        status: 'completed',
        selectedObjectIds: created,
        skipped: [],
        sideEffects: ['replace'],
        undoable: true,
      };
    }

    // copy-in-place：复制来源到每个目标的边界内（等比），可选删除目标。
    for (const targetId of request.targetObjectIds) {
      const target = this.findNode(spec, targetId);
      if (!target) {
        skipped.push({ objectId: targetId, reason: '目标引用失效' });
        continue;
      }
      if (target.hidden || target.locked) {
        skipped.push({ objectId: targetId, reason: '目标已隐藏或锁定；不自动解锁' });
        continue;
      }
      if (created.length === 0) this.pushUndo();
      copySeq += 1;
      const copy = JSON.parse(JSON.stringify(source)) as DemoNodeSpec;
      copy.id = `${source.id}-copy-${copySeq}-${Date.now() % 100000}`;
      copy.name = `${source.name ?? '对象'} 副本${copySeq}`;
      const fitted = planTransform(source.bounds, target.bounds, true);
      this.scaleNodeTo(copy, fitted);
      // 插入到目标同级（同父容器内、目标之后）；找不到父容器时退回图层根。
      const parentInfo = this.findParentInfo(spec, targetId);
      if (parentInfo) {
        parentInfo.container.splice(parentInfo.index + 1, 0, copy);
      } else {
        const layer = spec.layers.find((l) => l.children.some((c) => c.id === targetId));
        if (layer) layer.children.push(copy);
        else skipped.push({ objectId: targetId, reason: '目标位置无法确定' });
        continue;
      }
      created.push(copy.id);
      if (request.removeTargets) {
        const removal = this.findParentInfo(spec, targetId);
        if (removal) removal.container.splice(removal.index, 1);
      }
    }
    if (created.length > 0) this.bumpRevision(spec);
    return {
      status: skipped.length === 0 && created.length === request.targetObjectIds.length ? 'completed' : created.length > 0 ? 'partial' : 'failed',
      selectedObjectIds: created,
      skipped,
      sideEffects: created.length > 0 ? ['replace'] : [],
      undoable: created.length > 0,
    };
  }

  async applySymmetry(request: ApplySymmetryRequest): Promise<CommandResult> {
    if (request.live) {
      // 实时会话：首帧压撤销栈并保存基线；后续每帧先回到基线再应用（不累积）。
      if (!this.liveBaseline) {
        this.pushUndo();
        this.liveBaseline = JSON.parse(JSON.stringify(this.documents)) as DemoDocumentSpec[];
      } else {
        this.documents = JSON.parse(JSON.stringify(this.liveBaseline)) as DemoDocumentSpec[];
      }
    }
    let spec = this.activeSpec();
    // 基线恢复可能替换了对象引用，重新校验。
    try {
      spec = this.validateSession(request.docSessionId, undefined);
    } catch {
      this.liveBaseline = null;
      throw new CoreError({
        code: 'DOC_SESSION_MISMATCH',
        message: '实时对称会话中文档发生变化，已终止会话；请重新查询',
      });
    }
    const skipped: CommandResult['skipped'] = [];
    const affected: string[] = [];
    let wrote = false;
    let segmentSeq = 0;
    let mirrorSeq = 0;

    for (const item of request.items) {
      const node = this.findNode(spec, item.objectId);
      if (!node) {
        skipped.push({ objectId: item.objectId, reason: '对象引用失效' });
        continue;
      }
      if (node.hidden || node.locked) {
        skipped.push({ objectId: item.objectId, reason: '对象已隐藏或锁定；不自动解锁' });
        continue;
      }
      const rings =
        item.rings && item.rings.length > 0
          ? item.rings
          : item.points !== undefined
            ? [item.points]
            : [];
      if (item.points === undefined && (!item.rings || item.rings.length === 0)) {
        if (!wrote) {
          if (!request.live) this.pushUndo();
          wrote = true;
        }
        // 目标整体位于舍弃侧：删除该目标（不影响轴另一侧的其他对象）。
        const removal = this.findParentInfo(spec, item.objectId);
        if (removal) removal.container.splice(removal.index, 1);
        affected.push(item.objectId);
        continue;
      }
      if (rings.every((ring) => ring.length < 3)) {
        skipped.push({ objectId: item.objectId, reason: '切分结果无效' });
        continue;
      }
      if (!wrote) {
        if (!request.live) this.pushUndo();
        wrote = true;
      }
      const validRings = rings.filter((ring) => ring.length >= 3);
      // 首环替换原对象；凹形多环结果的其余环创建兄弟路径段。
      node.points = validRings[0]!.map((p) => [p[0], p[1]] as [number, number]);
      node.bounds = boundsOfPoints(node.points);
      affected.push(item.objectId);
      for (let r = 1; r < validRings.length; r += 1) {
        segmentSeq += 1;
        const segNode = JSON.parse(JSON.stringify(node)) as DemoNodeSpec;
        segNode.id = `${node.id}-seg-${segmentSeq}-${Date.now() % 100000}`;
        segNode.name = `${node.name ?? '对象'} 段${r + 1}`;
        segNode.points = validRings[r]!.map((p) => [p[0], p[1]] as [number, number]);
        segNode.bounds = boundsOfPoints(segNode.points);
        const parentInfo = this.findParentInfo(spec, item.objectId);
        if (parentInfo) parentInfo.container.splice(parentInfo.index + 1, 0, segNode);
        affected.push(segNode.id);
      }
      if (request.spec.mirrorRebuild) {
        for (const ring of validRings) {
          mirrorSeq += 1;
          const mirrorNode = JSON.parse(JSON.stringify(node)) as DemoNodeSpec;
          mirrorNode.id = `${node.id}-mirror-${mirrorSeq}-${Date.now() % 100000}`;
          mirrorNode.name = `${node.name ?? '对象'} 镜像`;
          const mirrored = mirrorPoints(ring, request.spec.axis, request.spec.position);
          mirrorNode.points = mirrored;
          mirrorNode.bounds = boundsOfPoints(mirrored);
          const parentInfo = this.findParentInfo(spec, item.objectId);
          if (parentInfo) parentInfo.container.splice(parentInfo.index + 1, 0, mirrorNode);
          else {
            const layer = spec.layers.find((l) => l.children.some((c) => c.id === item.objectId));
            layer?.children.push(mirrorNode);
          }
          affected.push(mirrorNode.id);
        }
      }
    }
    if (wrote) this.bumpRevision(spec);
    if (!request.live) this.liveBaseline = null;
    return {
      status: skipped.length === 0 && wrote ? 'completed' : wrote ? 'partial' : 'failed',
      selectedObjectIds: affected,
      skipped,
      sideEffects: wrote ? ['symmetry'] : [],
      undoable: wrote,
    };
  }

  async undoWrite(): Promise<CommandResult> {
    this.liveBaseline = null;
    const state = this.undoStack.pop();
    if (!state) {
      return {
        status: 'failed',
        selectedObjectIds: [],
        skipped: [],
        sideEffects: [],
        error: { code: 'INTERNAL_ERROR', message: '没有可撤销的写入' },
      };
    }
    this.documents = state.documents;
    this.activeSessionId = state.activeSessionId;
    this.selectionIds = new Set(state.selectionIds);
    // 撤销本身也是内容变化：revision 递增使撤销前后的引用都失效。
    const spec = this.activeSpec();
    this.bumpRevision(spec);
    return {
      status: 'completed',
      selectedObjectIds: [],
      skipped: [],
      sideEffects: ['undo'],
      undoable: this.undoStack.length > 0,
    };
  }

  /**
   * 转曲（演示近似）：文本容器替换为“已转曲”组，每个文字片段生成一个
   * 字符边界矩形轮廓路径。如实标注：真实宿主为字形轮廓，演示环境为近似矩形；
   * 统计口径真实变化（文字片段消失、路径对象增加）。
   */
  async convertTextToOutlines(request: ConvertOutlinesRequest): Promise<CommandResult> {
    const spec = this.validateSession(request.docSessionId, request.expectedCollectionStamp);
    const skipped: CommandResult['skipped'] = [];
    const affected: string[] = [];
    let converted = 0;
    let outlineSeq = 0;

    for (const objectId of request.objectIds) {
      const parentInfo = this.findParentInfo(spec, objectId);
      const node = this.findNode(spec, objectId);
      if (!node || !parentInfo) {
        skipped.push({ objectId, reason: '对象引用失效' });
        continue;
      }
      if (node.kind !== 'text-point' && node.kind !== 'text-area' && node.kind !== 'text-path') {
        skipped.push({ objectId, reason: '不是文本容器' });
        continue;
      }
      if (node.hidden || node.locked) {
        skipped.push({ objectId, reason: '对象已隐藏或锁定；不自动解锁' });
        continue;
      }
      if (!node.text || node.text.length === 0) {
        skipped.push({ objectId, reason: '文本无内容' });
        continue;
      }
      if (converted === 0) this.pushUndo();
      outlineSeq += 1;
      // 近似：按片段在容器宽度中的比例排布字符矩形。
      const totalUnits = node.text.reduce((sum, run) => sum + run.text.length, 0);
      if (totalUnits <= 0) {
        skipped.push({ objectId, reason: '文本无内容' });
        continue;
      }
      const width = node.bounds[2] - node.bounds[0];
      const height = node.bounds[3] - node.bounds[1];
      const charW = width / totalUnits;
      const children: DemoNodeSpec[] = [];
      let offsetUnits = 0;
      for (const run of node.text) {
        for (let c = 0; c < run.text.length; c += 1) {
          const x0 = node.bounds[0] + charW * offsetUnits;
          children.push({
            id: `${node.id}-glyph-${outlineSeq}-${offsetUnits}`,
            kind: 'path',
            name: `轮廓${offsetUnits}`,
            bounds: [x0, node.bounds[1] + height * 0.15, x0 + charW, node.bounds[1] + height * 0.85],
            points: [
              [x0, node.bounds[1] + height * 0.15],
              [x0 + charW, node.bounds[1] + height * 0.15],
              [x0 + charW, node.bounds[1] + height * 0.85],
              [x0, node.bounds[1] + height * 0.85],
            ],
            fill: node.fill ?? { swatch: 'sw-brand-blue' },
            stroke: { none: true },
          });
          offsetUnits += 1;
        }
      }
      const outlineGroup: DemoNodeSpec = {
        id: `${node.id}-outlines-${outlineSeq}-${Date.now() % 100000}`,
        kind: 'group',
        name: `${node.name ?? '文本'}（已转曲·演示近似）`,
        bounds: [...node.bounds] as [number, number, number, number],
        children,
      };
      parentInfo.container.splice(parentInfo.index, 1, outlineGroup);
      affected.push(outlineGroup.id);
      converted += 1;
    }
    if (converted > 0) this.bumpRevision(spec);
    return {
      status: converted === request.objectIds.length && converted > 0 ? 'completed' : converted > 0 ? 'partial' : 'failed',
      selectedObjectIds: affected,
      skipped,
      sideEffects: converted > 0 ? ['text-to-outlines'] : [],
      undoable: converted > 0,
    };
  }

  /**
   * 导出（演示）：真实生成 JSON 报告文件。浏览器环境触发下载；
   * 非浏览器（测试）环境在结果 message 中返回报告摘要。
   * 图片/PDF 格式如实返回 unsupported（需真实宿主）。
   */
  async exportFiles(request: ExportFilesRequest): Promise<CommandResult> {
    const spec = this.validateSession(request.docSessionId, undefined);
    const results: CommandResult['exportResults'] = [];
    for (const task of request.tasks) {
      if (task.format === 'png' || task.format === 'jpeg' || task.format === 'pdf') {
        results.push({
          name: task.name,
          status: 'unsupported',
          message: '演示环境不支持图片/PDF导出；需真实 Illustrator 宿主',
        });
        continue;
      }
      const snapshot = await this.collectSnapshot({
        kind: 'document',
        pierceGroups: true,
        pierceClipGroups: true,
        includeMaskPaths: false,
        includeHidden: true,
        includeLocked: true,
      });
      const report = {
        kind: 'aiq-export-report',
        generatedAt: new Date().toISOString(),
        document: { sessionId: spec.sessionId, name: spec.name },
        task: { name: task.name, scalePct: task.scalePct },
        coverage: snapshot.coverage,
        objectCount: snapshot.objects.length,
        textSpanCount: snapshot.textSpans.length,
        swatchInventory: snapshot.swatches.map((s) => ({ name: s.name, kind: s.kind, used: s.usedObjectIds.length > 0 })),
        objects: snapshot.objects.map((o) => ({
          id: o.objectId,
          kind: o.kind,
          name: o.name,
          bounds: o.bounds,
        })),
      };
      const filename = `${task.name || '导出报告'}.json`.replace(/[\\/:*?"<>|]/g, '_');
      let message = `报告包含 ${report.objectCount} 个对象、${report.textSpanCount} 个文字片段`;
      if (typeof document !== 'undefined' && typeof URL?.createObjectURL === 'function') {
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        message = `已导出 ${filename}（${message}）`;
      } else {
        message = `报告已生成：${filename}（${message}；当前环境无下载通道）`;
      }
      results.push({ name: task.name, status: 'done', message });
    }
    const done = results.filter((r) => r.status === 'done').length;
    return {
      status: done === results.length && done > 0 ? 'completed' : done > 0 ? 'partial' : 'failed',
      selectedObjectIds: [],
      skipped: results
        .filter((r) => r.status !== 'done')
        .map((r) => ({ objectId: r.name, reason: r.message ?? r.status })),
      sideEffects: done > 0 ? ['file-export'] : [],
      exportResults: results,
    };
  }

  /** 找到节点所在父容器的 children 数组与索引。 */
  private findParentInfo(
    spec: DemoDocumentSpec,
    nodeId: string,
  ): { container: DemoNodeSpec[]; index: number } | null {
    for (const layer of spec.layers) {
      const direct = layer.children.findIndex((c) => c.id === nodeId);
      if (direct >= 0) return { container: layer.children, index: direct };
      for (const top of layer.children) {
        const found = this.findInNode(top, nodeId);
        if (found) return found;
      }
    }
    return null;
  }

  private findInNode(node: DemoNodeSpec, nodeId: string): { container: DemoNodeSpec[]; index: number } | null {
    if (!node.children) return null;
    const idx = node.children.findIndex((c) => c.id === nodeId);
    if (idx >= 0 && node.children) return { container: node.children, index: idx };
    for (const child of node.children) {
      const found = this.findInNode(child, nodeId);
      if (found) return found;
    }
    return null;
  }

  private findNode(spec: DemoDocumentSpec, id: string): DemoNodeSpec | undefined {
    const search = (nodes: DemoNodeSpec[]): DemoNodeSpec | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = search(node.children ?? []);
        if (found) return found;
      }
      return undefined;
    };
    for (const layer of spec.layers) {
      const found = search(layer.children);
      if (found) return found;
    }
    return undefined;
  }

  // -----------------------------------------------------------------------
  // 演示专用控制（供演示工具栏使用；不属于 HostAdapter 通用契约）

  getSelectionIds(): string[] {
    return [...this.selectionIds];
  }

  setSelection(ids: string[]): void {
    this.selectionIds = new Set(ids);
  }

  addToSelection(ids: string[]): void {
    for (const id of ids) this.selectionIds.add(id);
  }

  /** 模拟宿主内容被外部编辑：递增 revision，使旧采集标记失效。 */
  simulateExternalEdit(): void {
    const spec = this.activeSpec();
    const current = this.revisions.get(spec.sessionId) ?? 1;
    this.revisions.set(spec.sessionId, current + 1);
  }
}
