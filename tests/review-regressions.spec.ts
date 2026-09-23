import { describe, it, expect } from 'vitest';
import { DEFAULT_QUERY_SCOPE } from '@aiq/contracts';
import { DemoHostAdapter, CepBridge, CepHostAdapter } from '@aiq/host-adapter';
import { resolveQuery } from '@aiq/core';
import { computeGradientStatistics, computeTextStatistics } from '@aiq/module-statistics';

describe('审查回归：范围与统计', () => {
  it('选中组再穿透，只查找其后代；继承父级锁定', async () => {
    const snap = await new DemoHostAdapter().collectSnapshot(DEFAULT_QUERY_SCOPE);
    const child = snap.objects.find(o => o.parentId && o.kind !== 'group')!;
    const parent = snap.objects.find(o => o.objectId === child.parentId)!;
    snap.selectionObjectIds = [parent.objectId];
    const scope = { ...DEFAULT_QUERY_SCOPE, kind: 'selection' as const, includeMaskPaths: true };
    const query = { scope, target: 'objects' as const };
    expect(resolveQuery(snap, query).objects.some(o => o.objectId === child.objectId)).toBe(true);
    parent.locked = true;
    expect(resolveQuery(snap, query).objects.some(o => o.objectId === child.objectId)).toBe(false);
    expect(resolveQuery(snap, query).restricted.some(o => o.objectId === child.objectId)).toBe(true);
    snap.selectionObjectIds = [];
    expect(resolveQuery(snap, query).dedupedTargetCount).toBe(0);
  });
  it('隐藏文字不计入默认统计，开启包含后才计入', async () => {
    const snap = await new DemoHostAdapter().collectSnapshot(DEFAULT_QUERY_SCOPE);
    const visible = computeTextStatistics(snap, DEFAULT_QUERY_SCOPE);
    const all = computeTextStatistics(snap, { ...DEFAULT_QUERY_SCOPE, includeHidden: true });
    expect(all.totalSpans).toBeGreaterThan(visible.totalSpans);
  });
  it('未使用渐变不计数；不同色标透明度不合并；一个配方多对象按使用对象计', async () => {
    const snap = await new DemoHostAdapter().collectSnapshot(DEFAULT_QUERY_SCOPE);
    const template = snap.objects.find(o => o.kind === 'path' && !o.parentId)!;
    snap.objects = ['a','b','c'].map(id => ({ ...template, objectId:id, hidden:false, locked:false, stroke:undefined,
      fill: { role:'fill' as const, color:{ colorId:id === 'c' ? 'g2' : 'g1', gradientId:id === 'c' ? 'g2' : 'g1', kind:'gradient' as const } } }));
    const stops = [{offset:0,colorId:'red',midpoint:30,opacity:100},{offset:100,colorId:'blue',opacity:100}];
    snap.gradients = [{ gradientId:'g1',kind:'linear',stops },{gradientId:'g2',kind:'linear',stops:[{...stops[0]!,opacity:50},stops[1]!]},{gradientId:'unused',kind:'radial',stops}];
    const stats = computeGradientStatistics(snap, DEFAULT_QUERY_SCOPE);
    expect(stats.recipeCount).toBe(2);
    expect(stats.instanceCount).toBe(3);
    expect(stats.recipes.some(r => r.instances.some(i => i.gradientId === 'unused'))).toBe(false);
    snap.gradients[1]!.stops = [{offset:0,colorId:'blue',midpoint:70},{offset:100,colorId:'red'}];
    expect(computeGradientStatistics(snap, DEFAULT_QUERY_SCOPE).recipeCount).toBe(1);
  });
});

describe('审查回归：宿主能力与桥接', () => {
  it('正确回带 ID 的非布尔 ok 仍拒绝，避免误报成功', async () => {
    const bridge = new CepBridge((script, cb) => {
      const request = JSON.parse(decodeURIComponent(script.slice('AIQ.handle("'.length,-2)));
      cb(JSON.stringify({id:request.id,ok:'false',data:{}}));
    });
    await expect(bridge.send('PING')).rejects.toMatchObject({code:'HOST_MALFORMED_RESPONSE'});
  });
  it('实测版本仅开放受限路径调整，其余危险宿主写入继续关闭', async () => {
    const bridge = new CepBridge((script, cb) => {
      const request = JSON.parse(decodeURIComponent(script.slice('AIQ.handle("'.length,-2)));
      cb(JSON.stringify({id:request.id,ok:true,data:{appName:'Adobe Illustrator',appVersion:'30.0.0'}}));
    });
    const info = await new CepHostAdapter(bridge).connect();
    expect(info.capabilities.collectSnapshot.supported).toBe(true);
    expect(info.capabilities.transformObjects.supported).toBe(true);
    expect(info.capabilities.undoWrite.supported).toBe(true);
    for (const key of ['writeTextStyles','replaceObjects','writePathPoints','convertTextToOutlines','exportFiles'] as const) {
      expect(info.capabilities[key]?.supported).toBe(false);
    }
    expect(info.capabilities.sampleTextSpanFormats.supported).toBe(false);
  });
});
