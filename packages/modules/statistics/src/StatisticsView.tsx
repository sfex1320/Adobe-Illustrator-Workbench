import { useCallback, useEffect, useState } from 'react';
import type { QueryRequest, TextStyleQuery } from '@aiq/contracts';
import { OBJECT_KIND_LABELS } from '@aiq/contracts';
import type { Workspace } from '@aiq/core';
import { Badge, Button, Card, EmptyState } from '@aiq/ui';
import { computeStatistics } from './compute.js';
import type { StatisticsResult } from './compute.js';

import { colorCss, gradientCss } from './color-preview';
const SCOPE_KIND_LABELS: Record<string, string> = {
  document: '整个文件',
  artboard: '画板',
  layer: '图层',
  selection: '选区',
};

export function StatisticsView({ workspace }: { workspace: Workspace }) {
  const [stats, setStats] = useState<StatisticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (forceRefresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const scope = workspace.currentScope();
        const snapshot = await workspace.ensureSnapshot(scope, { forceRefresh,readOnly:true });
        setStats(computeStatistics(snapshot, scope));
      } catch (e) {
        setStats(null);
        setError(e instanceof Error ? e.message : '统计失败');
      } finally {
        setLoading(false);
      }
    },
    [workspace],
  );

  useEffect(() => {
    void load(false);
    const offScope = workspace.onScopeChange(() => void load(false));
    const offDoc = workspace.events.on('document-changed', () => setStats(null));
    return () => {
      offScope();
      offDoc();
    };
  }, [workspace, load]);

  const querySpans = (textStyle: TextStyleQuery) => {
    const request: QueryRequest = {
      scope: workspace.currentScope(),
      target: 'text-spans',
      objectsFilter: { textStyle },
    };
    void workspace.resolveQuery(request).catch(() => undefined);
  };

  const queryObjectsByColor = (colorId: string) => {
    void workspace
      .resolveQuery({
        scope: workspace.currentScope(),
        target: 'objects',
        objectsFilter: { usesColorId: colorId },
      })
      .catch(() => undefined);
  };

  const queryObjectsByGradient = (gradientId: string) => {
    void workspace
      .resolveQuery({
        scope: workspace.currentScope(),
        target: 'objects',
        objectsFilter: { usesGradientId: gradientId },
      })
      .catch(() => undefined);
  };

  if (error) {
    return (
      <Card title="统计" icon="stats">
        <p className="aiq-error-text" role="alert">
          {error}
        </p>
        <Button icon="refresh" onClick={() => void load(true)}>
          重试
        </Button>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card title="统计" icon="stats">
        <EmptyState>{loading ? '正在统计……' : '暂无统计结果'}</EmptyState>
      </Card>
    );
  }

  return (
    <div role="region" aria-label="统计视图" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Card
        title={
          <>
            统计概览
            <Button icon="refresh" onClick={() => void load(true)} disabled={loading} style={{ marginLeft: 'auto' }}>
              刷新
            </Button>
          </>
        }
        icon="stats"
      >
        <p style={{ margin: '0 0 6px', color: 'var(--aiq-text-muted)' }}>
          范围：{SCOPE_KIND_LABELS[stats.scope.kind] ?? stats.scope.kind} · 文档：{stats.docName} ·
          采集时间：{stats.collectedAtIso.slice(11, 19)}
        </p>
        <ul className="aiq-stat-list">
          <li className="aiq-stat-row">
            <span className="aiq-stat-label">字体家族 / 款式组合</span>
            <span className="aiq-stat-value">
              {stats.text.familyCount} / {stats.text.familyStyleCount}
            </span>
          </li>
          <li className="aiq-stat-row">
            <span className="aiq-stat-label">文字片段 / 文本框 / 故事</span>
            <span className="aiq-stat-value">
              {stats.text.totalSpans} / {stats.text.containerCount} / {stats.text.storyCount}
            </span>
          </li>
          <li className="aiq-stat-row">
            <span className="aiq-stat-label">字符数（宿主单位 / 字素，串接去重）</span>
            <span className="aiq-stat-value">
              {stats.text.hostUnitChars} / {stats.text.graphemeChars}
            </span>
          </li>
          <li className="aiq-stat-row">
            <span className="aiq-stat-label">已解析使用颜色 / 色板库存 / 范围内未发现使用</span>
            <span className="aiq-stat-value">
              {stats.color.usedColors.length} / {stats.color.swatchInventory.length} /{' '}
              {stats.color.unusedSwatchIds.length}
            </span>
          </li>
          <li className="aiq-stat-row">
            <span className="aiq-stat-label">渐变配方（去重）/ 实例</span>
            <span className="aiq-stat-value">
              {stats.gradient.recipeCount} / {stats.gradient.instanceCount}
            </span>
          </li>
        </ul>
        <p style={{ margin: '8px 0 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone={stats.coverage.skippedObjectCount > 0 ? 'demo' : 'ok'}>
            覆盖：支持 {stats.coverage.supportedObjectCount} · 未解析 {stats.coverage.skippedObjectCount}
          </Badge>
            <Badge>范围内隐藏 {stats.coverage.hiddenInRange} · 锁定 {stats.coverage.lockedInRange}（是否计入由范围开关控制）</Badge>
        </p>
      </Card>

      <Card title="字体与字号分布" icon="doc">
        {stats.text.families.length === 0 ? (
          <EmptyState>范围内没有文字内容</EmptyState>
        ) : (
          stats.text.families.map((family) => (
            <div key={family.fontFamily} style={{ marginBottom: 8 }}>
              <strong>{family.fontFamily}</strong>
              <span className="aiq-stat-value">（{family.spanCount} 片段）</span>
              {family.styles.map((style) => (
                <div key={style.fontStyle} style={{ marginLeft: 10 }}>
                  <div className="aiq-stat-row is-clickable">
                    <button
                      type="button"
                      className="aiq-button"
                      style={{ padding: '2px 8px' }}
                      onClick={() => querySpans({ fontFamily: family.fontFamily, fontStyle: style.fontStyle })}
                      title="查询该家族与款式的全部片段"
                    >
                      {style.fontStyle}
                    </button>
                    <span className="aiq-stat-value">{style.spanCount} 片段</span>
                  </div>
                  {style.sizes.map((size) => (
                    <div key={size.fontSizePt} className="aiq-stat-row is-clickable" style={{ marginLeft: 18 }}>
                      <button
                        type="button"
                        className="aiq-button"
                        style={{ padding: '2px 8px' }}
                        onClick={() =>
                          querySpans({
                            fontFamily: family.fontFamily,
                            fontStyle: style.fontStyle,
                            fontSizePt: size.fontSizePt,
                          })
                        }
                        title="查询该家族、款式、字号的片段"
                      >
                        {size.fontSizePt}pt
                      </button>
                      <span className="aiq-stat-value">× {size.spanCount}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
        {stats.text.mixedContainers.length > 0 ? (
          <p style={{ margin: '8px 0 0', color: 'var(--aiq-warn)' }}>
            混合格式文本框 {stats.text.mixedContainers.length} 个：
            {stats.text.mixedContainers.map((c) => `${c.containerName}（${c.distinctStyles} 种）`).join('、')}
            ，统计按片段归类，不用首字概括整框。
          </p>
        ) : null}
      </Card>

      <Card title="颜色使用与库存" icon="panel">
        <p style={{ margin: '0 0 6px', color: 'var(--aiq-text-muted)', fontSize: 12 }}>
          使用（路径及文字填/描）与库存分开；专色按身份独立统计；无填充 {stats.color.noneUseCount} 处不计入颜色。
        </p>
        <ul className="aiq-stat-list">
          {stats.color.usedColors.map((color) => (
            <li key={color.colorId} className="aiq-stat-row is-clickable">
              <button
                type="button"
                className="aiq-button"
                style={{ padding: '2px 8px', flex: '1 1 auto', textAlign: 'left' }}
                onClick={() => queryObjectsByColor(color.colorId)}
                title="查询使用该颜色的对象"
              >
                <span className="wb-color-swatch" aria-hidden="true" title="屏幕颜色示意；印刷效果以色彩管理为准" style={{background:colorCss(color)}}/>
                {color.name ?? color.colorId}
                <span style={{ color: 'var(--aiq-text-muted)', marginLeft: 6 }}>
                  {color.kind === 'spot' ? '专色' : color.kind === 'spot-tint' ? '专色淡色' : color.kind}
                </span>
              </button>
              <span className="aiq-stat-value">{color.useCount} 处</span>
            </li>
          ))}
          {stats.color.usedColors.length === 0 ? <EmptyState>范围内没有使用的颜色</EmptyState> : null}
        </ul>
        <details style={{ marginTop: 8 }}>
          <summary>库存色板（{stats.color.swatchInventory.length} 项，点击展开）</summary>
          <ul className="aiq-stat-list" style={{ marginTop: 4 }}>
            {stats.color.swatchInventory.map((sw) => (
              <li key={sw.colorId} className="aiq-stat-row">
                <span className="aiq-stat-label">
                  {sw.name ?? sw.colorId}（{sw.kind}）
                </span>
                <Badge tone={sw.usedDirectly ? 'ok' : 'demo'}>
                  {sw.usedDirectly ? '使用中' : '已解析范围内未发现'}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
        {stats.color.unresolvedColors.length > 0 ? (
          <p className="aiq-error-text" style={{ margin: '8px 0 0' }}>
            未解析颜色 {stats.color.unresolvedColors.length} 处，单列显示不计为零。
          </p>
        ) : null}
      </Card>

      <Card title="渐变配方与实例" icon="stats">
        {stats.gradient.recipes.length === 0 && stats.gradient.unresolved.length === 0 ? (
          <EmptyState>范围内没有渐变</EmptyState>
        ) : (
          <>
            {stats.gradient.recipes.map((recipe) => (
              <div key={recipe.recipeKey} style={{ marginBottom: 6 }}>
                <strong>
                  {recipe.kind === 'linear' ? '线性' : '径向'}配方
                </strong>
                <span className="aiq-stat-value">（{recipe.instanceCount} 实例）</span>
                <ul className="aiq-stat-list" style={{ marginLeft: 10 }}>
                  {recipe.instances.map((inst) => (
                    <li key={inst.gradientId} className="aiq-stat-row is-clickable">
                      <button
                        type="button"
                        className="aiq-button"
                        style={{ padding: '2px 8px' }}
                        onClick={() => queryObjectsByGradient(inst.gradientId)}
                        title="查询使用该渐变实例的对象"
                      >
                        <span className="wb-color-swatch" aria-hidden="true" style={{background:gradientCss(inst)}}/>
                        {inst.name ?? inst.gradientId}
                      </button>
                      <Badge>{inst.direction === 'forward' ? '正向' : '反向'}</Badge>
                      <span className="aiq-stat-value">{inst.usedByObjectIds.length} 对象使用</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {stats.gradient.unresolved.length > 0 ? (
              <p style={{ margin: 0, color: 'var(--aiq-warn)' }}>
                未支持渐变类型 {stats.gradient.unresolved.length} 个：
                {stats.gradient.unresolved.map((g) => g.name ?? g.gradientId).join('、')}（自由渐变等，不显示为零使用）
              </p>
            ) : null}
          </>
        )}
      </Card>

      {stats.coverage.skippedEntries.length > 0 ? (
        <Card title="未解析内容" icon="warn">
          <ul className="aiq-stat-list">
            {stats.coverage.skippedEntries.map((entry) => (
              <li key={entry.objectId} className="aiq-stat-row">
                <span className="aiq-stat-label">
                  {OBJECT_KIND_LABELS[entry.kind ?? 'unknown']} · {entry.reason}
                </span>
                <span className="aiq-stat-value">{entry.objectId}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
