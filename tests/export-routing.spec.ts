import {expect,it} from 'vitest';
import {largeRasterNeeded} from '../packages/modules/export/src/raster-routing.js';
it('routes the reported 10x size without lowering resolution or confusing per-page and batch pixels',()=>{
 expect(largeRasterNeeded([[0,0,498.912,708.672]],1000,300,[0,0,0,0])).toBe(true);
 expect(largeRasterNeeded(Array.from({length:70},()=>[0,0,1440,1440] as const),100,300,[0,0,0,0])).toBe(false);
 expect(largeRasterNeeded([[0,0,7200,10]],100,300,[1,0,1,0])).toBe(true);
 expect(largeRasterNeeded([[0,0,720,720]],100,300,[0,0,0,0])).toBe(false);
});
