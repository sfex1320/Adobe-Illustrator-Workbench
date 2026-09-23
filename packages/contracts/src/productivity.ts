export type ProductivityAction = {type:'productivity'} & (
 | {operation:'mask-fit'; mode:'contain'|'cover'|'position'|'width'|'height'|'stretch'; anchorX:number;anchorY:number;dx:number;dy:number}
 | {operation:'duplicate-boards'; indexes:number[]}
 | {operation:'text-fit'; mode:'inspect'|'shrink'|'grow'; minSize:number;maxHeight:number}
 | {operation:'text-merge'; tolerance:number; separator:string;removeOriginals:boolean}
 | {operation:'baseline'}
 | {operation:'sequence'; values:string[];order:'rows'|'columns';placeholder:string;target:'text'|'pages'|'board-names';indexes:number[];offsetX:number;offsetY:number;fontSize:number}
 | {operation:'barcode'; labels:Array<{text:string;width:number;bars:Array<[number,number]>}>;order:'rows'|'columns';moduleWidth:number;height:number}
 | {operation:'photoshop';mode:'open'|'update'}
);
export interface ProductivityRow {index:number;label:string;status:'ok'|'overflow'|'skipped';detail:string}
