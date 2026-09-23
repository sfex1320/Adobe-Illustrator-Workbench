import type {Bounds} from '@aiq/contracts';

/** Same per-page native limits; never changes requested output quality. */
export function largeRasterNeeded(boxes:readonly Bounds[],percent:number,ppi:number,bleed:readonly number[]):boolean {
 return rasterDimensions(boxes,percent,ppi,bleed).some(([w,h])=>w>30000||h>30000||w*h>100000000);
}

export function rasterDimensions(boxes:readonly Bounds[],percent:number,ppi:number,bleed:readonly number[]):Array<readonly [number,number]> {
 if(!Number.isFinite(percent)||!Number.isFinite(ppi)||percent<=0||ppi<=0||bleed.length!==4||bleed.some(v=>!Number.isFinite(v)||v<0))return [];
 return boxes.filter(b=>b.every(Number.isFinite)&&b[2]>b[0]&&b[3]>b[1]).map(b=>[
  Math.ceil((b[2]-b[0]+bleed[0]!+bleed[2]!)*percent/100*ppi/72-1e-8),
  Math.ceil((b[3]-b[1]+bleed[1]!+bleed[3]!)*percent/100*ppi/72-1e-8),
 ] as const);
}
