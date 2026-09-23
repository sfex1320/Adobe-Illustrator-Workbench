import { expect, it } from 'vitest';
import { DEFAULT_QUERY_SCOPE, type ColorDef } from '@aiq/contracts';
import { DemoHostAdapter } from '@aiq/host-adapter';
import { resolveQuery } from '@aiq/core';
import { computeColorStatistics } from '@aiq/module-statistics';

it('文字中的多个颜色片段参与统计和反查，受隐藏范围限制', async () => {
  const snapshot = await new DemoHostAdapter().collectSnapshot(DEFAULT_QUERY_SCOPE);
  const text = snapshot.objects.find(o => o.objectId === 'title-mixed')!;
  const color: ColorDef = { colorId: 'text-only-red', kind: 'rgb', values: [255, 0, 0] };
  text.textPaints = [{ role: 'fill', color }, { role: 'fill', color }];
  const stats = computeColorStatistics(snapshot, DEFAULT_QUERY_SCOPE);
  const used = stats.usedColors.find(c => c.colorId === color.colorId)!;
  expect(used.useCount).toBe(2);
  expect(used.objectIds).toEqual([text.objectId]);
  const query = { scope: DEFAULT_QUERY_SCOPE, target: 'objects' as const, objectsFilter: { usesColorId: color.colorId } };
  expect(resolveQuery(snapshot, query).objects.map(o => o.objectId)).toEqual([text.objectId]);
  text.hidden = true;
  expect(computeColorStatistics(snapshot, DEFAULT_QUERY_SCOPE).usedColors.some(c => c.colorId === color.colorId)).toBe(false);
  expect(resolveQuery(snapshot, query).objects).toHaveLength(0);
});

it('文字专色仍保持身份，预览色不与相同 RGB 合并', async () => {
  const snapshot = await new DemoHostAdapter().collectSnapshot(DEFAULT_QUERY_SCOPE);
  const text = snapshot.objects.find(o => o.objectId === 'title-mixed')!;
  text.textPaints = [
    { role: 'fill', color: { colorId: 'brand-spot', kind: 'spot', name: '品牌红', previewRgb: [255, 0, 0] } },
    { role: 'stroke', color: { colorId: 'preview-red', kind: 'rgb', values: [255, 0, 0] } },
  ];
  const colors = computeColorStatistics(snapshot, DEFAULT_QUERY_SCOPE).usedColors;
  expect(colors.find(c => c.colorId === 'brand-spot')).toMatchObject({ kind: 'spot', previewRgb: [255, 0, 0] });
  expect(colors.find(c => c.colorId === 'preview-red')).toMatchObject({ kind: 'rgb', values: [255, 0, 0] });
});

it('按填色或描边分别选择对象，仍匹配混合文字的局部颜色',async()=>{
 const snapshot=await new DemoHostAdapter().collectSnapshot(DEFAULT_QUERY_SCOPE);
 const text=snapshot.objects.find(o=>o.objectId==='title-mixed')!;
 const color:ColorDef={colorId:'isolated-selection-red',kind:'rgb',values:[255,0,0]};
 text.textPaints=[{role:'stroke',color}];
 const query={scope:DEFAULT_QUERY_SCOPE,target:'objects' as const,objectsFilter:{usesColorId:color.colorId,colorRole:'fill' as 'fill'|'stroke'}};
 expect(resolveQuery(snapshot,query).objects).toHaveLength(0);
 query.objectsFilter.colorRole='stroke';expect(resolveQuery(snapshot,query).objects.map(o=>o.objectId)).toEqual([text.objectId]);
 text.locked=true;expect(resolveQuery(snapshot,query).objects).toHaveLength(0);
});
