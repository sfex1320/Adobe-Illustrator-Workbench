import type {Bounds} from '@aiq/contracts';
/** Values are left/top/right/bottom expansion in points. */
export function adjustArtboardEdges(bounds:Bounds,edges:number[]):Bounds {
 if(edges.length!==4||!edges.every(Number.isFinite))throw Error('请填写有效的四边调整值');
 const result:Bounds=[bounds[0]-edges[0]!,bounds[1]-edges[1]!,bounds[2]+edges[2]!,bounds[3]+edges[3]!];
 if(!result.every(Number.isFinite)||result[2]<=result[0]||result[3]<=result[1])throw Error('调整后画板宽高必须大于零');
 if(result[2]-result[0]>16348||result[3]-result[1]>16348)throw Error('调整后超出普通画布尺寸范围');
 return result;
}
