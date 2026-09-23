export interface VariableRun { text:string; bold:boolean }
export interface VariableCell { text:string; runs:VariableRun[]; error?:string }
export interface VariableTable {
 sheet:string; sheets:string[]; columns:Array<{id:string;label:string}>;
 rows:Array<{row:number;cells:Record<string,VariableCell>}>; warnings:string[];
}
export type VariableHeaderDirection = 'row'|'column';
export interface VariableTarget { id:string; name:string; kind:string; text?:string; width:number; height:number; rectangle?:boolean }
export interface VariableTemplate {
 token:string; docName:string; boardName:string; width:number; height:number; objectCount:number;
 targets:VariableTarget[]; characterStyles:string[]; graphicStyles:string[]; boardIndex?:number; docSessionId?:string;
 /** Conservative visible artwork span including content outside the artboard. */
 artworkWidth?:number; artworkHeight?:number;
}
export interface VariableBinding {
 id:string; column:string; targetId:string; kind:'text'|'image'|'qr'|'graphic'|'fill'|'opacity';
 placeholder:string; empty:'error'|'keep'|'clear'; fit:'contain'|'cover'|'width'|'height';
 style:'template'|'emphasis'|'custom'; font:string; boldFont:string; size?:number;
 characterStyle:string; graphicStyle:string; opacity?:number; fill:string;
 overflow:'error'|'shrink'; minSize:number;
}
export interface VariableValue { bindingId:string; text:string; runs:VariableRun[]; qr?:string[]; skip?:boolean }
export interface VariableRowPlan { row:number; name:string; values:VariableValue[] }
export interface VariableResultRow { row:number; status:'completed'|'failed'; artboardIndex?:number; reason?:string }
export type VariableAction =
 | {type:'variable-data';operation:'capture';artboardIndex?:number;artworkAssignments?:number[]}
 | {type:'variable-data';operation:'bind-selection';templateToken:string}
 | {type:'variable-data';operation:'images';folder:string}
 | {type:'variable-data';operation:'generate'|'preview';templateToken:string;bindings:VariableBinding[];rows:VariableRowPlan[];columns:number;rowsPerBlock?:number;gap:number;horizontalGap?:number;verticalGap?:number;jobId?:string};
